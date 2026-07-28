import { getDb, upsertMember, getMember, claimStripeEvent } from "./db.mjs";
import { markBookingPaid, markBookingExpired } from "./booking-routes.mjs";
import { applyProductPurchase } from "./member-from-payment.mjs";
import { recordPaymentEvent } from "./bookings-db.mjs";
import { config } from "./config.mjs";
import { randomUUID } from "node:crypto";

/**
 * Apply Stripe events to memberships.
 *
 * Stripe guarantees at-least-once delivery: a timeout, a 5xx, or one click of
 * "Resend" in the dashboard replays an event. Everything below must therefore be
 * safe to run twice — and the pack-credit grant was not, so three deliveries of one
 * £65 purchase handed out fifteen classes. The event-id claim is the outer guard;
 * the per-handler guards (booking status, payment_events unique index) stay as the
 * inner one.
 */
export function applyStripeEvent(event) {
  const database = getDb();
  const type = event.type;
  const obj = event.data?.object;
  if (!obj) return { handled: false };

  // One transaction per event: an event either lands completely or not at all. A
  // handler that threw halfway used to leave the membership updated but the ledger
  // row missing, and Stripe would then retry on top of that partial state.
  return inTransaction(database, () => {
    if (!claimStripeEvent(database, event.id, type)) {
      return { handled: true, duplicate: true, type, eventId: event.id };
    }
    return dispatch(database, type, obj);
  });
}

function inTransaction(database, fn) {
  database.prepare("BEGIN IMMEDIATE").run();
  try {
    const result = fn();
    database.prepare("COMMIT").run();
    return result;
  } catch (e) {
    // Rolling back drops the idempotency claim too, so Stripe's retry gets a clean run.
    try {
      database.prepare("ROLLBACK").run();
    } catch {
      /* already unwound */
    }
    throw e;
  }
}

function dispatch(database, type, obj) {

  if (type === "invoice.payment_failed") {
    return patchByStripeCustomer(database, obj.customer, {
      lastPaymentStatus: "failed",
      lastPaymentAt: isoFromUnix(obj.created)
    });
  }

  if (type === "invoice.paid" || type === "invoice.payment_succeeded") {
    const patch = patchByStripeCustomer(database, obj.customer, {
      lastPaymentStatus: "ok",
      lastPaymentAt: isoFromUnix(obj.status_transitions?.paid_at || obj.created)
    });
    const ledger = recordSubscriptionInvoicePayment(database, obj);
    return { ...patch, ledger };
  }

  if (type === "customer.subscription.deleted") {
    return patchByStripeCustomer(database, obj.customer, {
      status: "lapsed",
      autoRenew: false,
      mrrContribution: 0
    });
  }

  if (type === "customer.subscription.updated") {
    // Previously only the "active" case was handled, so a subscription that moved to
    // past_due or unpaid left the membership row saying "active" indefinitely.
    const patch = {
      status: mapSubscriptionStatus(obj.status),
      renewalDate: isoDateFromUnix(obj.current_period_end),
      autoRenew: obj.status === "active" && !obj.cancel_at_period_end
    };
    if (patch.status !== "active") patch.mrrContribution = 0;
    return patchByStripeCustomer(database, obj.customer, patch);
  }

  if (type === "checkout.session.expired") {
    if (obj.metadata?.booking_id || obj.metadata?.booking_ids) {
      return markBookingExpired(database, obj);
    }
  }

  if (type === "checkout.session.completed") {
    if (obj.metadata?.booking_id || obj.metadata?.booking_ids) {
      return markBookingPaid(database, obj);
    }
    if (obj.metadata?.product_id) {
      // Async payment methods can complete a session before the money lands.
      if (obj.payment_status && obj.payment_status !== "paid") {
        return { handled: false, reason: "payment_not_paid", paymentStatus: obj.payment_status };
      }
      const result = applyProductPurchase(database, obj);
      if (result?.member) {
        return {
          handled: true,
          memberId: result.member.id,
          product: obj.metadata.product_id,
          creditsGranted: result.creditsGranted
        };
      }
    }
    const email = obj.customer_details?.email || obj.customer_email;
    const memberId = obj.metadata?.member_id || obj.metadata?.memberId;
    if (memberId) {
      const m = getMember(database, memberId);
      if (m) {
        upsertMember(database, {
          ...m,
          lastPaymentStatus: "ok",
          lastPaymentAt: new Date().toISOString(),
          stripeCustomerId: obj.customer
        });
        return { handled: true, memberId };
      }
    }
    if (email) {
      return patchByEmail(database, email, {
        lastPaymentStatus: "ok",
        lastPaymentAt: new Date().toISOString(),
        stripeCustomerId: obj.customer
      });
    }
  }

  return { handled: false, type };
}

/** Stripe subscription status -> the vocabulary the membership row and door use. */
function mapSubscriptionStatus(stripeStatus) {
  switch (stripeStatus) {
    case "active":
      return "active";
    case "trialing":
      return "trialing";
    case "past_due":
      return "past_due";
    case "unpaid":
      return "unpaid";
    case "canceled":
      return "lapsed";
    case "incomplete":
    case "incomplete_expired":
      return "incomplete_expired";
    case "paused":
      return "expired";
    default:
      return stripeStatus || "expired";
  }
}

function isoFromUnix(sec) {
  if (!sec) return new Date().toISOString();
  return new Date(sec * 1000).toISOString();
}

function isoDateFromUnix(sec) {
  if (!sec) return null;
  return new Date(sec * 1000).toISOString().slice(0, 10);
}

function patchByStripeCustomer(database, customerId, patch) {
  if (!customerId) return { handled: false };
  const row = database
    .prepare("SELECT member_id FROM memberships WHERE stripe_customer_id = ?")
    .get(customerId);
  if (!row) return { handled: false, reason: "no_member_for_customer" };
  const m = getMember(database, row.member_id);
  upsertMember(database, { ...m, ...patch, stripeCustomerId: customerId });
  return { handled: true, memberId: row.member_id };
}

function patchByEmail(database, email, patch) {
  const row = database
    .prepare("SELECT member_id FROM memberships WHERE lower(email) = lower(?)")
    .get(email);
  if (!row) return { handled: false, reason: "no_member_for_email" };
  const m = getMember(database, row.member_id);
  upsertMember(database, { ...m, ...patch });
  return { handled: true, memberId: row.member_id };
}

/** Monthly renewals — first charge is recorded from checkout.session.completed. */
function recordSubscriptionInvoicePayment(database, invoice) {
  if (invoice.billing_reason === "subscription_create") {
    return { skipped: "subscription_create" };
  }
  const pi =
    typeof invoice.payment_intent === "string" ? invoice.payment_intent : invoice.payment_intent?.id;
  if (!pi) return { skipped: "no_payment_intent" };
  if (
    database.prepare("SELECT id FROM payment_events WHERE stripe_payment_intent = ? LIMIT 1").get(pi)
  ) {
    return { duplicate: true };
  }
  const customerId =
    typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
  if (!customerId) return { skipped: "no_customer" };
  const row = database
    .prepare("SELECT member_id FROM memberships WHERE stripe_customer_id = ?")
    .get(customerId);
  if (!row) return { skipped: "no_member_for_customer" };
  const amountPence = Number(invoice.amount_paid) || 0;
  if (amountPence <= 0) return { skipped: "zero_amount" };
  const platformFeePence =
    Number(invoice.application_fee_amount) ||
    Math.floor((amountPence * config.platformFeeBps) / 10000);
  recordPaymentEvent(database, {
    id: `pay_${randomUUID().slice(0, 12)}`,
    source: "membership_renewal",
    referenceId: invoice.id,
    memberId: row.member_id,
    amountPence,
    platformFeePence,
    currency: invoice.currency || "gbp",
    status: "paid",
    stripePaymentIntent: pi,
    customerEmail: invoice.customer_email || null
  });
  return { recorded: true, amountPence, platformFeePence };
}
