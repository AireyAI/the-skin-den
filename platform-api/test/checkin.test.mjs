import test from "node:test";
import assert from "node:assert/strict";
import { mintCheckinToken, verifyCheckinToken, parseCheckinScan, checkinQrUrl } from "../src/checkin-token.mjs";
import { getDb, upsertMember, getMember } from "../src/db.mjs";
import { performCheckIn } from "../src/checkin-routes.mjs";

test("check-in token round-trip and URL parse", () => {
  const token = mintCheckinToken({ memberId: "m-test-1", userId: "u-test-1" });
  assert.ok(token.includes("."));
  const payload = verifyCheckinToken(token);
  assert.equal(payload.m, "m-test-1");
  assert.equal(payload.u, "u-test-1");
  const url = checkinQrUrl(token);
  assert.ok(url.includes("/v/checkin?t="));
  const parsed = parseCheckinScan(url);
  assert.equal(parsed.m, "m-test-1");
});

test("pack check-in decrements credits", () => {
  const database = getDb();
  const id = "m-checkin-pack-" + Date.now();
  upsertMember(database, {
    id,
    userId: null,
    name: "Pack Tester",
    email: `pack-${Date.now()}@example.com`,
    phone: "",
    plan: "10 class pack",
    planType: "pack",
    status: "active",
    renewalDate: null,
    autoRenew: false,
    lastPaymentStatus: "ok",
    lastPaymentAt: null,
    mrrContribution: 0,
    packCredits: 7,
    packExpiresAt: null,
    joinedAt: new Date().toISOString(),
    lastClassAt: null,
    notes: "",
    contactedAt: null,
    stripeCustomerId: null
  });
  const member = getMember(database, id);
  const r1 = performCheckIn({ database, member, coachId: "coach-1", scanRaw: "test" });
  assert.equal(r1.ok, true);
  assert.equal(r1.deducted, true);
  assert.equal(r1.member.packCredits, 6);
  const r2 = performCheckIn({
    database,
    member: getMember(database, id),
    coachId: "coach-1",
    scanRaw: "test2"
  });
  assert.equal(r2.alreadyCheckedIn, true);
  assert.equal(getMember(database, id).packCredits, 6);
});
