import { randomUUID } from "node:crypto";
import { getMember, upsertMember } from "./db.mjs";
import { recordPaymentEvent } from "./bookings-db.mjs";
import { config } from "./config.mjs";

/** Create or update a membership row when someone pays (class checkout, etc.). */
export function ensureMemberFromClassPayment(database, payload) {
  const email = (payload.email || "").trim().toLowerCase();
  const name = (payload.name || "").trim() || email.split("@")[0];
  const phone = (payload.phone || "").trim();
  if (!email) return null;

  const existingRow = database
    .prepare("SELECT member_id FROM memberships WHERE lower(email) = lower(?)")
    .get(email);
  const memberId = existingRow?.member_id || `mem_${randomUUID().slice(0, 10)}`;
  const prev = getMember(database, memberId);
  const now = new Date().toISOString();
  const classDate = payload.slotDate || now.slice(0, 10);

  const member = {
    id: memberId,
    userId: prev?.userId ?? null,
    name: prev?.name || name,
    email,
    phone: phone || prev?.phone || "",
    plan: prev?.planType === "subscription" ? prev.plan : "Drop-in / class pay",
    planType: prev?.planType === "subscription" || prev?.planType === "pack" ? prev.planType : "drop_in",
    status: prev?.status === "lapsed" ? "active" : prev?.status || "active",
    renewalDate: prev?.renewalDate ?? null,
    autoRenew: prev?.autoRenew ?? false,
    lastPaymentStatus: "ok",
    lastPaymentAt: now,
    mrrContribution: prev?.mrrContribution ?? 0,
    packCredits: prev?.packCredits ?? null,
    packExpiresAt: prev?.packExpiresAt ?? null,
    joinedAt: prev?.joinedAt ?? now.slice(0, 10),
    lastClassAt: classDate,
    notes: prev?.notes || "",
    contactedAt: prev?.contactedAt ?? null,
    stripeCustomerId: payload.stripeCustomerId || prev?.stripeCustomerId || null
  };

  upsertMember(database, member);
  return member;
}

/**
 * Apply pack or membership purchase from Stripe Checkout metadata.
 *
 * Grants credits, so it must never run twice for one payment. The event-id claim in
 * applyStripeEvent is the first guard; the payment_events unique index on the payment
 * intent is the second, and covers the case where the same purchase arrives under a
 * different event id.
 *
 * @returns {{member: object, creditsGranted: number, duplicate?: boolean}|null}
 */
export function applyProductPurchase(database, session) {
  const meta = session.metadata || {};
  const productId = meta.product_id;
  if (!productId || meta.booking_id) return null;

  const email = (
    session.customer_details?.email ||
    meta.customer_email ||
    session.customer_email ||
    ""
  )
    .trim()
    .toLowerCase();
  if (!email) return null;

  const paymentRef =
    (typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id) ||
    session.subscription ||
    session.id;
  if (alreadyRecorded(database, paymentRef)) {
    const existing = database
      .prepare("SELECT member_id FROM payment_events WHERE stripe_payment_intent = ?")
      .get(paymentRef);
    const member = existing?.member_id ? getMember(database, existing.member_id) : null;
    return member ? { member, creditsGranted: 0, duplicate: true } : null;
  }

  const name = (meta.customer_name || email.split("@")[0]).trim();
  const planType = meta.plan_type === "subscription" ? "subscription" : "pack";
  const existingRow = database
    .prepare("SELECT member_id FROM memberships WHERE lower(email) = lower(?)")
    .get(email);
  const memberId = resolveMemberId(database, meta, existingRow, email);
  const prev = getMember(database, memberId);
  const now = new Date().toISOString();
  const today = now.slice(0, 10);

  let packCredits = prev?.packCredits ?? null;
  let packExpiresAt = prev?.packExpiresAt ?? null;
  let plan = prev?.plan || "Class pack";
  let renewalDate = prev?.renewalDate ?? null;
  let autoRenew = prev?.autoRenew ?? false;
  let mrr = prev?.mrrContribution ?? 0;
  let creditsGranted = 0;

  if (planType === "pack") {
    const credits = Number(meta.pack_credits) || 5;
    const days = Number(meta.pack_validity_days) || 90;
    packCredits = (prev?.packCredits ?? 0) + credits;
    creditsGranted = credits;
    const exp = new Date();
    exp.setDate(exp.getDate() + days);
    packExpiresAt = exp.toISOString().slice(0, 10);
    plan = packPlanLabel(credits);
  } else {
    plan = "Monthly membership";
    autoRenew = true;
    // The renewal is a month out, not today — a subscription that renews the day it
    // was bought reads as "expiring now" everywhere it is displayed.
    renewalDate = addMonth(today);
    mrr = amountPounds(session, meta) ?? prev?.mrrContribution ?? 0;
  }

  const member = {
    id: memberId,
    userId: prev?.userId ?? null,
    name: prev?.name || name,
    email,
    phone: prev?.phone || "",
    plan,
    planType,
    status: "active",
    renewalDate,
    autoRenew,
    lastPaymentStatus: "ok",
    lastPaymentAt: now,
    mrrContribution: planType === "subscription" ? mrr : prev?.mrrContribution ?? 0,
    packCredits: planType === "pack" ? packCredits : prev?.packCredits ?? null,
    packExpiresAt: planType === "pack" ? packExpiresAt : prev?.packExpiresAt ?? null,
    joinedAt: prev?.joinedAt ?? today,
    lastClassAt: prev?.lastClassAt ?? null,
    notes: prev?.notes || "",
    contactedAt: prev?.contactedAt ?? null,
    stripeCustomerId:
      (typeof session.customer === "string" ? session.customer : session.customer?.id) ||
      prev?.stripeCustomerId ||
      null
  };

  upsertMember(database, member);

  // Pack and membership sales never reached the ledger, so the admin Payments tab and
  // every revenue figure showed only class bookings — i.e. none of this money.
  const amountPence = purchaseAmountPence(session, meta);
  if (amountPence > 0) {
    recordPaymentEvent(database, {
      id: `pay_${randomUUID().slice(0, 12)}`,
      source: planType === "subscription" ? "membership" : "class_pack",
      referenceId: meta.purchase_id || session.id,
      memberId: member.id,
      amountPence,
      platformFeePence: Math.floor((amountPence * config.platformFeeBps) / 10000),
      currency: session.currency || "gbp",
      status: "paid",
      stripePaymentIntent: paymentRef,
      customerEmail: email
    });
  }

  return { member, creditsGranted };
}

function alreadyRecorded(database, paymentRef) {
  if (!paymentRef) return false;
  return Boolean(
    database.prepare("SELECT id FROM payment_events WHERE stripe_payment_intent = ? LIMIT 1").get(paymentRef)
  );
}

/**
 * Only honour a caller-supplied member_id when it belongs to the address that paid.
 * It arrives from an unauthenticated checkout body, so without this check anyone
 * could point a £65 purchase at someone else's membership row — which also rewrites
 * that row's email to the buyer's.
 */
function resolveMemberId(database, meta, existingRow, email) {
  const claimed = meta.member_id;
  if (claimed) {
    const row = database.prepare("SELECT member_id, email FROM memberships WHERE member_id = ?").get(claimed);
    if (!row) return claimed; // id we minted for a brand-new member
    if (String(row.email || "").toLowerCase() === email) return claimed;
    console.warn(
      `[platform-api] ignoring metadata.member_id ${claimed}: checkout email does not match that membership`
    );
  }
  return existingRow?.member_id || `mem_${randomUUID().slice(0, 10)}`;
}

function packPlanLabel(credits) {
  return credits > 0 ? `${credits}-class pack` : "Class pack";
}

function addMonth(isoDate) {
  const d = new Date(`${isoDate}T12:00:00`);
  d.setMonth(d.getMonth() + 1);
  return d.toISOString().slice(0, 10);
}

function purchaseAmountPence(session, meta) {
  const raw = session.amount_total ?? session.amount_subtotal ?? Number(meta.amount_pence);
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

/** Monthly recurring contribution in pounds, from what was actually charged. */
function amountPounds(session, meta) {
  const pence = purchaseAmountPence(session, meta);
  return pence > 0 ? Math.round(pence) / 100 : null;
}
