import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { getDb } from "../src/db.mjs";
import { squareConfig } from "../src/square-config.mjs";
import {
  startSquareConnect,
  completeSquareConnect,
  squareStatus,
  disconnectSquare,
  sellerAccess,
  clearSquareForRevokedMerchant,
  clearMerchantLock,
  resetSquareStatusCache
} from "../src/square-oauth.mjs";
import { fakeSquare, testEnv, coach } from "./square-fake.mjs";

const db = getDb();
const cfg = (overrides) => squareConfig(testEnv(overrides), { production: false });

beforeEach(() => {
  db.prepare("DELETE FROM square_connection").run();
  db.prepare("DELETE FROM square_oauth_states").run();
  db.prepare("DELETE FROM square_merchant_lock").run();
  resetSquareStatusCache();
});

function stateFrom(result) {
  return new URL(result.json.url).searchParams.get("state");
}

async function connect({ sq = fakeSquare(), who = coach() } = {}) {
  const started = startSquareConnect({ db, cfg: cfg(), coach: who });
  assert.equal(started.status, 200, JSON.stringify(started.json));
  const done = await completeSquareConnect({
    db,
    cfg: cfg(),
    coach: who,
    input: { code: "good-code", state: stateFrom(started) },
    fetchImpl: sq.fetchImpl
  });
  return { started, done, sq };
}

test("start builds a Square sign-in link with least scopes and a random single-use state", () => {
  const r = startSquareConnect({ db, cfg: cfg(), coach: coach() });
  assert.equal(r.status, 200);
  const url = new URL(r.json.url);
  assert.equal(url.origin + url.pathname, "https://connect.squareupsandbox.com/oauth2/authorize");
  assert.equal(url.searchParams.get("client_id"), "sandbox-sq0idb-skinden");
  assert.equal(url.searchParams.get("scope"), "MERCHANT_PROFILE_READ ORDERS_READ ORDERS_WRITE PAYMENTS_READ PAYMENTS_WRITE");
  assert.equal(url.searchParams.get("redirect_uri"), "http://localhost:4327/admin/");
  assert.equal(url.searchParams.get("session"), null, "sandbox does not support session=false");
  assert.ok(stateFrom(r).length >= 40);
  const row = db.prepare("SELECT * FROM square_oauth_states").get();
  assert.notEqual(row.state_hash, stateFrom(r), "only a hash of the state is stored");
});

test("production asks Square to show the account picker (session=false)", () => {
  const prodCfg = squareConfig(
    testEnv({
      SQUARE_ENVIRONMENT: "production",
      SQUARE_REDIRECT_URI: "https://theskinden.co.uk/admin/",
      SQUARE_WEBHOOK_URL: "https://api.example.test/v1/square/webhook"
    }),
    { production: true }
  );
  const r = startSquareConnect({ db, cfg: prodCfg, coach: coach() });
  const url = new URL(r.json.url);
  assert.equal(url.origin, "https://connect.squareup.com");
  assert.equal(url.searchParams.get("session"), "false");
});

test("start refuses when Square is not configured", () => {
  const r = startSquareConnect({ db, cfg: squareConfig({}, { production: false }), coach: coach() });
  assert.equal(r.status, 503);
  assert.equal(r.json.code, "not_configured");
});

test("start and disconnect need a recent sign-in", async () => {
  const stale = coach({ ageSec: 16 * 60 });
  const r = startSquareConnect({ db, cfg: cfg(), coach: stale });
  assert.equal(r.status, 401);
  assert.equal(r.json.code, "reauth");
  await connect();
  const d = await disconnectSquare({ db, cfg: cfg(), coach: stale, fetchImpl: fakeSquare().fetchImpl });
  assert.equal(d.status, 401);
  assert.equal(d.json.code, "reauth");
});

test("completing works even when Square sign-in took longer than the freshness window", async () => {
  const who = coach({ ageSec: 14 * 60 });
  const started = startSquareConnect({ db, cfg: cfg(), coach: who });
  const later = { ...who, iat: who.iat - 10 * 60 }; // same token, now 24 minutes old
  const done = await completeSquareConnect({
    db,
    cfg: cfg(),
    coach: later,
    input: { code: "good-code", state: stateFrom(started) },
    fetchImpl: fakeSquare().fetchImpl
  });
  assert.equal(done.status, 200, JSON.stringify(done.json));
});

test("a successful connection stores encrypted tokens and shows the business, never the tokens", async () => {
  const { done } = await connect();
  assert.equal(done.status, 200);
  assert.equal(done.json.merchantName, "The Skin Den");
  assert.equal(done.json.locationName, "The Skin Den Carlisle");
  assert.equal(JSON.stringify(done.json).includes("access-1"), false);
  const row = db.prepare("SELECT * FROM square_connection").get();
  assert.equal(row.merchant_id, "MERCHANT_RACHEL");
  assert.equal(row.tokens_cipher.includes("access-1"), false);
  assert.equal(row.tokens_cipher.includes("refresh-1"), false);
});

test("state is single use, expires, and belongs to the signed-in session that started it", async () => {
  const who = coach();
  const started = startSquareConnect({ db, cfg: cfg(), coach: who });
  const state = stateFrom(started);
  const otherSession = await completeSquareConnect({
    db, cfg: cfg(), coach: coach({ jti: "jti-other" }), input: { code: "good-code", state }, fetchImpl: fakeSquare().fetchImpl
  });
  assert.equal(otherSession.status, 400);
  const ok = await completeSquareConnect({ db, cfg: cfg(), coach: who, input: { code: "good-code", state }, fetchImpl: fakeSquare().fetchImpl });
  assert.equal(ok.status, 200);
  db.prepare("DELETE FROM square_connection").run();
  const replay = await completeSquareConnect({ db, cfg: cfg(), coach: who, input: { code: "good-code", state }, fetchImpl: fakeSquare().fetchImpl });
  assert.equal(replay.status, 400);
  assert.equal(replay.json.code, "state");

  const again = startSquareConnect({ db, cfg: cfg(), coach: who });
  db.prepare("UPDATE square_oauth_states SET expires_at = ?").run(Date.now() - 1);
  const expired = await completeSquareConnect({
    db, cfg: cfg(), coach: who, input: { code: "good-code", state: stateFrom(again) }, fetchImpl: fakeSquare().fetchImpl
  });
  assert.equal(expired.status, 400);
});

test("malformed callback input is rejected before calling Square", async () => {
  const sq = fakeSquare();
  const r = await completeSquareConnect({ db, cfg: cfg(), coach: coach(), input: { code: 5, state: "x y" }, fetchImpl: sq.fetchImpl });
  assert.equal(r.status, 400);
  assert.equal(sq.calls.length, 0);
});

test("a token for another app, merchant or missing scopes is refused", async () => {
  for (const state of [{ clientId: "someone-else" }, { scopes: ["MERCHANT_PROFILE_READ"] }]) {
    db.prepare("DELETE FROM square_connection").run();
    const { done } = await connect({ sq: fakeSquare({ state }) });
    assert.equal(done.status, 409, JSON.stringify(state));
    assert.equal(db.prepare("SELECT COUNT(*) AS c FROM square_connection").get().c, 0);
  }
});

test("only an active UK business with one card-ready GBP location can connect", async () => {
  const cases = [
    { merchant: { id: "MERCHANT_RACHEL", status: "INACTIVE", country: "GB" } },
    { merchant: { id: "MERCHANT_RACHEL", status: "ACTIVE", country: "US" } },
    { locations: [] },
    {
      locations: [
        { id: "L1", merchant_id: "MERCHANT_RACHEL", status: "ACTIVE", country: "GB", currency: "GBP", capabilities: [] }
      ]
    },
    {
      locations: ["L1", "L2"].map((id) => ({
        id, merchant_id: "MERCHANT_RACHEL", status: "ACTIVE", country: "GB", currency: "GBP", capabilities: ["CREDIT_CARD_PROCESSING"]
      }))
    }
  ];
  for (const state of cases) {
    const { done } = await connect({ sq: fakeSquare({ state }) });
    assert.equal(done.status, 409, JSON.stringify(state));
    assert.ok(done.json.error);
  }
  assert.equal(db.prepare("SELECT COUNT(*) AS c FROM square_connection").get().c, 0);
});

test("an existing connection is never replaced silently", async () => {
  await connect();
  const r = startSquareConnect({ db, cfg: cfg(), coach: coach() });
  assert.equal(r.status, 409);
  assert.equal(r.json.code, "connected");
});

test("after the first connection, a different Square business is refused until the lock is cleared", async () => {
  await connect();
  db.prepare("DELETE FROM square_connection").run();
  const other = fakeSquare({
    state: {
      merchantId: "MERCHANT_OTHER",
      merchant: { id: "MERCHANT_OTHER", status: "ACTIVE", country: "GB" },
      locations: [{ id: "LX", merchant_id: "MERCHANT_OTHER", status: "ACTIVE", country: "GB", currency: "GBP", capabilities: ["CREDIT_CARD_PROCESSING"] }]
    },
    handlers: { "GET /v2/merchants/MERCHANT_OTHER": () => [200, { merchant: { id: "MERCHANT_OTHER", status: "ACTIVE", country: "GB" } }] }
  });
  const refused = await connect({ sq: other });
  assert.equal(refused.done.status, 409);
  assert.equal(refused.done.json.code, "different_merchant");
  assert.ok(other.calls.some((c) => c.key === "POST /oauth2/revoke"), "the unwanted grant is revoked");

  clearMerchantLock(db, "sandbox");
  const allowed = await connect({ sq: other });
  assert.equal(allowed.done.status, 200);
});

test("status reports not configured, not connected and connected", async () => {
  assert.equal((await squareStatus({ db, cfg: squareConfig({}, { production: false }) })).json.configured, false);
  const none = await squareStatus({ db, cfg: cfg(), fetchImpl: fakeSquare().fetchImpl });
  assert.equal(none.json.connected, false);
  await connect();
  const yes = await squareStatus({ db, cfg: cfg(), fetchImpl: fakeSquare().fetchImpl });
  assert.equal(yes.json.connected, true);
  assert.equal(yes.json.needsReconnect, false);
  assert.equal(yes.json.environment, "sandbox");
});

test("status checks with Square and asks to reconnect when access was removed", async () => {
  await connect();
  const revoked = fakeSquare({ handlers: { "POST /oauth2/token/status": () => [401, { errors: [{ code: "UNAUTHORIZED" }] }] } });
  const r = await squareStatus({ db, cfg: cfg(), fetchImpl: revoked.fetchImpl });
  assert.equal(r.json.needsReconnect, true);
});

test("a lost or changed encryption key asks to reconnect instead of crashing", async () => {
  await connect();
  const otherKey = squareConfig(testEnv({ SQUARE_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64") }), { production: false });
  const r = await squareStatus({ db, cfg: otherKey, fetchImpl: fakeSquare().fetchImpl });
  assert.equal(r.status, 200);
  assert.equal(r.json.needsReconnect, true);
});

test("disconnect revokes with the app secret and removes the connection", async () => {
  await connect();
  const sq = fakeSquare();
  const r = await disconnectSquare({ db, cfg: cfg(), coach: coach(), fetchImpl: sq.fetchImpl });
  assert.equal(r.status, 200);
  const revoke = sq.calls.find((c) => c.key === "POST /oauth2/revoke");
  assert.equal(revoke.headers.Authorization, "Client test-app-secret");
  assert.equal(revoke.body.access_token, "access-1");
  assert.equal(db.prepare("SELECT COUNT(*) AS c FROM square_connection").get().c, 0);
});

test("seller access renews a token that is close to expiry, and a disconnect wins a refresh race", async () => {
  const soon = new Date(Date.now() + 2 * 86400000).toISOString();
  await connect({ sq: fakeSquare({ state: { expiresAt: soon } }) });
  const renewed = fakeSquare({ state: { accessToken: "access-2" } });
  const access = await sellerAccess({ db, cfg: cfg(), fetchImpl: renewed.fetchImpl });
  assert.equal(access.accessToken, "access-2");
  const refresh = renewed.calls.find((c) => c.key === "POST /oauth2/token");
  assert.equal(refresh.body.grant_type, "refresh_token");

  db.prepare("UPDATE square_connection SET access_expires_at = ?").run(soon);
  const racing = fakeSquare({
    state: { accessToken: "access-3" },
    handlers: {
      "POST /oauth2/token": () => {
        db.prepare("DELETE FROM square_connection").run(); // disconnected while renewing
        return [200, { access_token: "access-3", refresh_token: "refresh-1", expires_at: new Date(Date.now() + 30 * 86400000).toISOString(), merchant_id: "MERCHANT_RACHEL" }];
      }
    }
  });
  await assert.rejects(() => sellerAccess({ db, cfg: cfg(), fetchImpl: racing.fetchImpl }));
  assert.equal(db.prepare("SELECT COUNT(*) AS c FROM square_connection").get().c, 0, "renewal must not revive a disconnected row");
});

test("Square revoking access clears the matching connection only", async () => {
  await connect();
  assert.equal(clearSquareForRevokedMerchant(db, "MERCHANT_SOMEONE_ELSE"), false);
  assert.equal(clearSquareForRevokedMerchant(db, "MERCHANT_RACHEL"), true);
  assert.equal(db.prepare("SELECT COUNT(*) AS c FROM square_connection").get().c, 0);
});

test("a renewal that loses a race uses the winner's fresh token instead of asking to reconnect", async () => {
  const soon = new Date(Date.now() + 2 * 86400000).toISOString();
  await connect({ sq: fakeSquare({ state: { expiresAt: soon } }) });
  const { encryptTokens } = await import("../src/square-crypto.mjs");
  const racing = fakeSquare({
    handlers: {
      "POST /oauth2/token": () => {
        // Another request renews first and stores its own tokens.
        const winner = encryptTokens(testEnv().SQUARE_TOKEN_ENCRYPTION_KEY, "sandbox-sq0idb-skinden:sandbox:MERCHANT_RACHEL", { accessToken: "access-winner", refreshToken: "refresh-1" });
        db.prepare("UPDATE square_connection SET tokens_cipher = ?, access_expires_at = ?, refreshed_at = ?").run(winner, new Date(Date.now() + 30 * 86400000).toISOString(), new Date().toISOString());
        return [200, { access_token: "access-loser", refresh_token: "refresh-1", expires_at: new Date(Date.now() + 30 * 86400000).toISOString(), merchant_id: "MERCHANT_RACHEL" }];
      }
    }
  });
  const access = await sellerAccess({ db, cfg: cfg(), fetchImpl: racing.fetchImpl });
  assert.equal(access.accessToken, "access-winner");
  const status = await squareStatus({ db, cfg: cfg(), fetchImpl: fakeSquare().fetchImpl });
  assert.equal(status.json.needsReconnect, false);
});
