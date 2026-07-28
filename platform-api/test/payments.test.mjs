import test from "node:test";
import assert from "node:assert/strict";
import { getDb, upsertMember } from "../src/db.mjs";
import { ensureMemberFromClassPayment } from "../src/member-from-payment.mjs";
import { bookingRevenueSummary, recordPaymentEvent } from "../src/bookings-db.mjs";
import { applyStripeEvent } from "../src/stripe-events.mjs";

test("ensureMemberFromClassPayment creates drop-in member", () => {
  const db = getDb();
  const email = `test-${Date.now()}@example.com`;
  const member = ensureMemberFromClassPayment(db, {
    email,
    name: "Test User",
    slotDate: "2026-07-28"
  });
  assert.ok(member);
  assert.equal(member.email, email);
  assert.equal(member.planType, "drop_in");
  assert.equal(member.lastPaymentStatus, "ok");
});

test("bookingRevenueSummary sums paid rows", () => {
  const db = getDb();
  const id = `bk_test_${Date.now()}`;
  db.prepare(
    `INSERT INTO class_bookings (id, offering_id, slot_date, customer_name, customer_email, status, price_pence, created_at)
     VALUES (?,?,?,?,?,?,?,?)`
  ).run(id, "group-strength-tue", "2026-07-28", "A", "a@example.com", "paid", 1500, new Date().toISOString());
  recordPaymentEvent(db, {
    id: `pay_${Date.now()}`,
    source: "class_booking",
    referenceId: id,
    amountPence: 1500,
    platformFeePence: 75,
    status: "paid",
    customerEmail: "a@example.com"
  });
  const summary = bookingRevenueSummary(db, 30);
  assert.ok(summary.paidCount >= 1);
  assert.ok(summary.grossPence >= 1500);
});

test("invoice.paid renewal records ledger with platform fee", () => {
  const db = getDb();
  const memberId = `mem_inv_${Date.now()}`;
  const customerId = `cus_test_${Date.now()}`;
  upsertMember(db, {
    id: memberId,
    userId: null,
    name: "Renewal Test",
    email: `renew-${Date.now()}@example.com`,
    phone: "",
    plan: "Monthly membership",
    planType: "subscription",
    status: "active",
    renewalDate: "2026-08-26",
    autoRenew: true,
    lastPaymentStatus: "ok",
    lastPaymentAt: new Date().toISOString(),
    mrrContribution: 55,
    packCredits: null,
    packExpiresAt: null,
    joinedAt: "2026-07-26",
    lastClassAt: null,
    notes: "",
    contactedAt: null,
    stripeCustomerId: customerId
  });
  const pi = `pi_renew_${Date.now()}`;
  const result = applyStripeEvent({
    id: `evt_${Date.now()}`,
    type: "invoice.paid",
    data: {
      object: {
        id: `in_${Date.now()}`,
        customer: customerId,
        billing_reason: "subscription_cycle",
        amount_paid: 10000,
        application_fee_amount: 500,
        currency: "gbp",
        payment_intent: pi
      }
    }
  });
  assert.equal(result.ledger?.recorded, true);
  const row = db.prepare("SELECT * FROM payment_events WHERE stripe_payment_intent = ?").get(pi);
  assert.equal(row.amount_pence, 10000);
  assert.equal(row.platform_fee_pence, 500);
});
