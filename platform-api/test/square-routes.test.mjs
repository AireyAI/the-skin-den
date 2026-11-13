import test from "node:test";
import assert from "node:assert/strict";
import { issueCoachToken, issueMemberToken } from "../src/auth-crypto.mjs";
import { config } from "../src/config.mjs";
import { getDb } from "../src/db.mjs";
import { handleSquareAdminRoutes, handleSquareWebhookRoute } from "../src/square-routes.mjs";
import { testEnv } from "./square-fake.mjs";

Object.assign(process.env, testEnv());
// Test files share one database; start from no Square connection.
for (const table of ["square_connection", "square_oauth_states", "square_merchant_lock"]) {
  getDb().prepare(`DELETE FROM ${table}`).run();
}

const req = (token) => ({ headers: token ? { authorization: `Bearer ${token}` } : {} });

test("Square admin routes need a studio-owner sign-in", async () => {
  const none = await handleSquareAdminRoutes("GET", "/v1/admin/square/status", {}, req());
  assert.equal(none.status, 401);
  const member = await handleSquareAdminRoutes("GET", "/v1/admin/square/status", {}, req(issueMemberToken("user-1", config.jwtSecret)));
  assert.equal(member.status, 403);
  const owner = await handleSquareAdminRoutes("GET", "/v1/admin/square/status", {}, req(issueCoachToken("coach-1", config.jwtSecret)));
  assert.equal(owner.status, 200);
  assert.equal(owner.json.configured, true);
});

test("other paths are left to the rest of the server, unknown Square paths are 404", async () => {
  assert.equal(await handleSquareAdminRoutes("GET", "/v1/admin/dashboard", {}, req()), null);
  const unknown = await handleSquareAdminRoutes("GET", "/v1/admin/square/nope", {}, req(issueCoachToken("coach-1", config.jwtSecret)));
  assert.equal(unknown.status, 404);
});

test("the connect route returns a Square sign-in link for a fresh owner sign-in", async () => {
  const r = await handleSquareAdminRoutes("POST", "/v1/admin/square/connect", {}, req(issueCoachToken("coach-1", config.jwtSecret)));
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.match(r.json.url, /^https:\/\/connect\.squareupsandbox\.com\/oauth2\/authorize\?/);
});

test("the webhook route rejects an unsigned request", async () => {
  const r = await handleSquareWebhookRoute({ headers: {} }, Buffer.from("{}"));
  assert.equal(r.status, 403);
});
