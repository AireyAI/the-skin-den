import test from "node:test";
import assert from "node:assert/strict";
import { getDb, upsertMember, getMember } from "../src/db.mjs";
import { performCheckIn } from "../src/checkin-routes.mjs";
import { applyProductPurchase } from "../src/member-from-payment.mjs";
import { applyStripeEvent } from "../src/stripe-events.mjs";
import { membershipForUser, linkMembershipToUser } from "../src/db.mjs";

function packMember(overrides = {}) {
  const id = overrides.id || `m-reg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    id,
    userId: overrides.userId ?? null,
    name: "Test Member",
    email: overrides.email || `${id}@example.com`,
    phone: "",
    plan: "5-class pack",
    planType: "pack",
    status: overrides.status ?? "active",
    renewalDate: null,
    autoRenew: false,
    lastPaymentStatus: "ok",
    lastPaymentAt: null,
    mrrContribution: 0,
    packCredits: overrides.packCredits ?? 5,
    packExpiresAt: null,
    joinedAt: "2026-07-01",
    lastClassAt: null,
    notes: "",
    contactedAt: null,
    stripeCustomerId: null,
    ...overrides
  };
}

test("lapsed subscription is refused at the door", () => {
  const database = getDb();
  const member = packMember({
    planType: "subscription",
    plan: "Monthly membership",
    packCredits: null,
    status: "lapsed"
  });
  upsertMember(database, member);
  const result = performCheckIn({
    database,
    member: getMember(database, member.id),
    coachId: "coach-test",
    scanRaw: "test-lapsed"
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 403);
  assert.match(result.error, /lapsed/i);
});

test("stripe event replay does not double pack credits", () => {
  const database = getDb();
  const email = `stripe-dup-${Date.now()}@example.com`;
  const eventId = `evt_test_${Date.now()}`;
  const session = {
    id: `cs_test_${Date.now()}`,
    payment_status: "paid",
    payment_intent: `pi_test_${Date.now()}`,
    customer_details: { email },
    metadata: {
      product_id: "class-pack-5",
      plan_type: "pack",
      pack_credits: "5",
      pack_validity_days: "90",
      purchase_id: `pur_${Date.now()}`
    },
    amount_total: 6500
  };
  const event = {
    id: eventId,
    type: "checkout.session.completed",
    data: { object: session }
  };

  const r1 = applyStripeEvent(event);
  assert.equal(r1.handled, true);
  assert.equal(r1.duplicate, undefined);
  const m1 = database.prepare("SELECT member_id FROM memberships WHERE lower(email) = lower(?)").get(email);
  assert.ok(m1);
  assert.equal(getMember(database, m1.member_id).packCredits, 5);

  const r2 = applyStripeEvent(event);
  assert.equal(r2.duplicate, true);
  assert.equal(getMember(database, m1.member_id).packCredits, 5);
});

test("membership is not linked by email alone on register path", () => {
  const database = getDb();
  const buyerEmail = `buyer-${Date.now()}@example.com`;
  upsertMember(database, packMember({ email: buyerEmail, userId: null, packCredits: 5 }));

  const strangerId = `usr_stranger_${Date.now()}`;
  database
    .prepare(
      "INSERT INTO users (id, email, password_hash, name, created_at) VALUES (?, ?, ?, ?, ?)"
    )
    .run(strangerId, `other-${Date.now()}@example.com`, "x", "Stranger", new Date().toISOString());

  const linked = linkMembershipToUser(database, strangerId, buyerEmail, "unverified_email");
  assert.equal(linked.linked, false);

  const victimMembership = membershipForUser(database, strangerId);
  assert.equal(victimMembership, null);

  const proofLink = linkMembershipToUser(database, strangerId, buyerEmail, "stripe_checkout_session");
  assert.equal(proofLink.linked, true);
  assert.equal(membershipForUser(database, strangerId)?.packCredits, 5);
});
