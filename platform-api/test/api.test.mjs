import test from "node:test";
import assert from "node:assert/strict";
import { hashPassword, verifyPassword, issueCoachToken, verifyJwt } from "../src/auth-crypto.mjs";

test("password hash round-trip", () => {
  const h = hashPassword("test-password-123");
  assert.ok(verifyPassword("test-password-123", h));
  assert.equal(verifyPassword("wrong", h), false);
});

test("jwt coach token", () => {
  const secret = "test-secret";
  const token = issueCoachToken("coach_1", secret);
  const payload = verifyJwt(token, secret);
  assert.equal(payload.sub, "coach_1");
  assert.equal(payload.role, "coach");
});
