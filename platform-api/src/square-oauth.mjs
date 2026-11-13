import { createHash, randomBytes } from "node:crypto";
import { SQUARE_SCOPES, squareConfigProblems } from "./square-config.mjs";
import { encryptTokens, decryptTokens } from "./square-crypto.mjs";
import { squareRequest, SquareError } from "./square-api.mjs";

/** Starting or removing a connection needs a sign-in this recent. */
const FRESH_SIGN_IN_SEC = 15 * 60;
const STATE_TTL_MS = 10 * 60 * 1000;
/** Renew when the access token has under a week left, or was last renewed over 6 days ago. */
const RENEW_BEFORE_MS = 7 * 86400000;
const RENEW_EVERY_MS = 6 * 86400000;
const STATUS_CACHE_MS = 5 * 60 * 1000;

const sha256 = (value) => createHash("sha256").update(String(value)).digest("hex");
const ok = (json) => ({ status: 200, json });
const fail = (status, code, error) => ({ status, json: { error, code } });

let statusCache = null;
export function resetSquareStatusCache() {
  statusCache = null;
}

function notConfigured(cfg) {
  return squareConfigProblems(cfg).length > 0;
}

function signedInRecently(coach, nowMs) {
  return Number.isFinite(coach?.iat) && nowMs / 1000 - coach.iat <= FRESH_SIGN_IN_SEC;
}

const REAUTH = fail(401, "reauth", "For your security, sign out and sign in again, then try this again.");
const NOT_CONFIGURED = fail(503, "not_configured", "Square isn't set up on the studio server yet.");

function tokenBinding(cfg, merchantId) {
  return `${cfg.applicationId}:${cfg.environment}:${merchantId}`;
}

export function getConnectionRow(db) {
  return db.prepare("SELECT * FROM square_connection WHERE id = 1").get() || null;
}

export function startSquareConnect({ db, cfg, coach, now = Date.now() }) {
  if (notConfigured(cfg)) return NOT_CONFIGURED;
  if (!signedInRecently(coach, now)) return REAUTH;
  if (getConnectionRow(db)) {
    return fail(409, "connected", "Square is already connected. Disconnect it first to connect a different account.");
  }
  const state = randomBytes(32).toString("base64url");
  db.prepare("DELETE FROM square_oauth_states WHERE expires_at < ? OR coach_id = ?").run(now, coach.sub);
  db.prepare(
    `INSERT INTO square_oauth_states (state_hash, coach_id, jti_hash, application_id, environment, redirect_uri, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(sha256(state), coach.sub, sha256(coach.jti || ""), cfg.applicationId, cfg.environment, cfg.redirectUri, now + STATE_TTL_MS);

  const url = new URL("/oauth2/authorize", cfg.apiBase);
  url.searchParams.set("client_id", cfg.applicationId);
  url.searchParams.set("scope", SQUARE_SCOPES.join(" "));
  url.searchParams.set("state", state);
  url.searchParams.set("redirect_uri", cfg.redirectUri);
  // Makes the owner actively pick the business. Square's sandbox does not support it.
  if (cfg.environment === "production") url.searchParams.set("session", "false");
  return ok({ url: url.toString() });
}

function validCallbackInput(input) {
  const code = input?.code;
  const state = input?.state;
  return (
    typeof code === "string" && code.length > 0 && code.length <= 512 && /^[\w.-]+$/.test(code) &&
    typeof state === "string" && state.length >= 20 && state.length <= 128 && /^[\w-]+$/.test(state)
  );
}

function consumeState(db, cfg, coach, state, now) {
  return db
    .prepare(
      `DELETE FROM square_oauth_states
       WHERE state_hash = ? AND coach_id = ? AND jti_hash = ? AND application_id = ? AND environment = ?
         AND redirect_uri = ? AND expires_at > ?
       RETURNING state_hash`
    )
    .get(sha256(state), coach?.sub || "", sha256(coach?.jti || ""), cfg.applicationId, cfg.environment, cfg.redirectUri, now);
}

class SellerRefused extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

/** Confirms the grant is ours and finds the one location payments should go to. */
async function verifySeller(cfg, tokens, fetchImpl) {
  const token = tokens.access_token;
  const status = await squareRequest(cfg, "/oauth2/token/status", { method: "POST", token, fetchImpl });
  if (
    status.client_id !== cfg.applicationId ||
    status.merchant_id !== tokens.merchant_id ||
    !SQUARE_SCOPES.every((scope) => status.scopes?.includes(scope))
  ) {
    throw new SellerRefused("grant", "Square returned an unexpected business or permissions. Please try again.");
  }
  const [{ merchant }, { locations = [] }] = await Promise.all([
    squareRequest(cfg, `/v2/merchants/${encodeURIComponent(tokens.merchant_id)}`, { token, fetchImpl }),
    squareRequest(cfg, "/v2/locations", { token, fetchImpl })
  ]);
  if (merchant?.id !== tokens.merchant_id || merchant.status !== "ACTIVE" || merchant.country !== "GB") {
    throw new SellerRefused("merchant", "Connect an active UK Square business account.");
  }
  const usable = locations.filter(
    (l) =>
      l.merchant_id === merchant.id &&
      l.status === "ACTIVE" &&
      l.country === "GB" &&
      l.currency === "GBP" &&
      l.capabilities?.includes("CREDIT_CARD_PROCESSING")
  );
  if (usable.length === 0) {
    throw new SellerRefused("location", "Your Square account has no UK location ready to take card payments yet. Finish setting up in Square, then try again.");
  }
  if (usable.length > 1) {
    throw new SellerRefused("locations", "Your Square account has more than one location. Contact us so we can choose which one payments should go to.");
  }
  return {
    merchantId: merchant.id,
    merchantName: merchant.business_name || usable[0].business_name || usable[0].name || "Your Square business",
    locationId: usable[0].id,
    locationName: usable[0].name || ""
  };
}

async function revokeQuietly(cfg, accessToken, fetchImpl) {
  try {
    await squareRequest(cfg, "/oauth2/revoke", {
      method: "POST",
      clientAuth: true,
      body: { client_id: cfg.applicationId, access_token: accessToken },
      fetchImpl
    });
    return true;
  } catch {
    return false;
  }
}

function publicConnection(row, extra = {}) {
  return {
    configured: true,
    connected: true,
    environment: row.environment,
    merchantName: row.merchant_name,
    locationName: row.location_name,
    connectedAt: row.connected_at,
    needsReconnect: false,
    ...extra
  };
}

export async function completeSquareConnect({ db, cfg, coach, input, fetchImpl = fetch, now = Date.now() }) {
  if (notConfigured(cfg)) return NOT_CONFIGURED;
  if (!validCallbackInput(input)) return fail(400, "input", "That Square sign-in link wasn't complete. Please try connecting again.");
  if (!consumeState(db, cfg, coach, input.state, now)) {
    return fail(400, "state", "That Square sign-in has expired or was already used. Please try connecting again.");
  }

  let tokens;
  try {
    tokens = await squareRequest(cfg, "/oauth2/token", {
      method: "POST",
      body: {
        client_id: cfg.applicationId,
        client_secret: cfg.applicationSecret,
        code: input.code,
        grant_type: "authorization_code",
        redirect_uri: cfg.redirectUri
      },
      fetchImpl
    });
  } catch (e) {
    return fail(e.transient ? 503 : 400, "exchange", "Square didn't accept that sign-in. Please try connecting again.");
  }
  if (!tokens.access_token || !tokens.refresh_token || !tokens.merchant_id || !(Date.parse(tokens.expires_at) > now)) {
    return fail(502, "exchange", "Square returned an incomplete sign-in. Please try connecting again.");
  }

  let seller;
  try {
    seller = await verifySeller(cfg, tokens, fetchImpl);
  } catch (e) {
    await revokeQuietly(cfg, tokens.access_token, fetchImpl);
    if (e instanceof SellerRefused) return fail(409, e.code, e.message);
    return fail(e.transient ? 503 : 502, "verify", "Square couldn't confirm your account just now. Please try again.");
  }

  const lock = db.prepare("SELECT merchant_id FROM square_merchant_lock WHERE environment = ?").get(cfg.environment);
  if (lock && lock.merchant_id !== seller.merchantId) {
    await revokeQuietly(cfg, tokens.access_token, fetchImpl);
    return fail(409, "different_merchant", "This is a different Square business from the one connected before. Contact us to change it.");
  }

  const stamp = new Date(now).toISOString();
  const cipher = encryptTokens(cfg.encryptionKey, tokenBinding(cfg, seller.merchantId), {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token
  });
  const inserted = db
    .prepare(
      `INSERT OR IGNORE INTO square_connection
        (id, application_id, environment, merchant_id, merchant_name, location_id, location_name, tokens_cipher, access_expires_at, refreshed_at, connected_at)
       VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(cfg.applicationId, cfg.environment, seller.merchantId, seller.merchantName, seller.locationId, seller.locationName, cipher, tokens.expires_at, stamp, stamp);
  if (inserted.changes === 0) {
    await revokeQuietly(cfg, tokens.access_token, fetchImpl);
    return fail(409, "connected", "Square was connected from another session. Refresh the dashboard.");
  }
  db.prepare("INSERT OR IGNORE INTO square_merchant_lock (environment, merchant_id, locked_at) VALUES (?, ?, ?)").run(
    cfg.environment,
    seller.merchantId,
    stamp
  );
  resetSquareStatusCache();
  return ok(publicConnection(getConnectionRow(db)));
}

function readTokens(cfg, row) {
  return decryptTokens(cfg.encryptionKey, tokenBinding(cfg, row.merchant_id), row.tokens_cipher);
}

function renewalDue(row, now) {
  return Date.parse(row.access_expires_at) - now < RENEW_BEFORE_MS || now - Date.parse(row.refreshed_at) > RENEW_EVERY_MS;
}

/**
 * The seller's current access token, renewed first when due. The renewal update only
 * applies to the exact row it read, so it can never bring back a disconnected account.
 */
export async function sellerAccess({ db, cfg, fetchImpl = fetch, now = Date.now() }) {
  const row = getConnectionRow(db);
  if (!row) throw new SquareError("Square is not connected.", { code: "not_connected" });
  if (row.application_id !== cfg.applicationId || row.environment !== cfg.environment) {
    throw new SquareError("Square settings changed. Reconnect Square.", { code: "reconnect" });
  }
  let tokens;
  try {
    tokens = readTokens(cfg, row);
  } catch {
    throw new SquareError("Square access can't be read. Reconnect Square.", { code: "reconnect" });
  }
  if (renewalDue(row, now)) {
    const renewed = await squareRequest(cfg, "/oauth2/token", {
      method: "POST",
      body: {
        client_id: cfg.applicationId,
        client_secret: cfg.applicationSecret,
        grant_type: "refresh_token",
        refresh_token: tokens.refreshToken
      },
      fetchImpl
    });
    if (!renewed.access_token || renewed.merchant_id !== row.merchant_id || !(Date.parse(renewed.expires_at) > now)) {
      throw new SquareError("Square returned an unexpected renewal. Reconnect Square.", { code: "reconnect" });
    }
    const next = { accessToken: renewed.access_token, refreshToken: renewed.refresh_token || tokens.refreshToken };
    const cipher = encryptTokens(cfg.encryptionKey, tokenBinding(cfg, row.merchant_id), next);
    const updated = db
      .prepare("UPDATE square_connection SET tokens_cipher = ?, access_expires_at = ?, refreshed_at = ? WHERE id = 1 AND tokens_cipher = ?")
      .run(cipher, renewed.expires_at, new Date(now).toISOString(), row.tokens_cipher);
    if (updated.changes === 0) {
      // Another request renewed (or disconnected) first. Use whatever is stored now.
      const current = getConnectionRow(db);
      if (!current) throw new SquareError("Square is not connected.", { code: "not_connected" });
      try {
        tokens = readTokens(cfg, current);
      } catch {
        throw new SquareError("Square access can't be read. Reconnect Square.", { code: "reconnect" });
      }
      return { accessToken: tokens.accessToken, merchantId: current.merchant_id, locationId: current.location_id };
    }
    tokens = next;
  }
  return { accessToken: tokens.accessToken, merchantId: row.merchant_id, locationId: row.location_id };
}

export async function squareStatus({ db, cfg, fetchImpl = fetch, now = Date.now() }) {
  if (notConfigured(cfg)) return ok({ configured: false, connected: false });
  const row = getConnectionRow(db);
  if (!row) return ok({ configured: true, connected: false, environment: cfg.environment });
  if (statusCache && statusCache.cipher === row.tokens_cipher && now - statusCache.at < STATUS_CACHE_MS) {
    return ok(statusCache.json);
  }
  let json;
  try {
    const { accessToken } = await sellerAccess({ db, cfg, fetchImpl, now });
    await squareRequest(cfg, "/oauth2/token/status", { method: "POST", token: accessToken, fetchImpl });
    json = publicConnection(getConnectionRow(db) || row, { checkedAt: new Date(now).toISOString() });
  } catch (e) {
    if (e.transient) return ok(publicConnection(row, { checked: false }));
    if (e.code === "not_connected" || !getConnectionRow(db)) {
      return ok({ configured: true, connected: false, environment: cfg.environment });
    }
    json = publicConnection(row, { needsReconnect: true });
  }
  const current = getConnectionRow(db);
  if (current) statusCache = { cipher: current.tokens_cipher, at: now, json };
  return ok(json);
}

export async function disconnectSquare({ db, cfg, coach, fetchImpl = fetch, now = Date.now() }) {
  if (!signedInRecently(coach, now)) return REAUTH;
  const row = getConnectionRow(db);
  if (!row) return ok({ disconnected: true, revoked: false });
  let revoked = false;
  try {
    revoked = await revokeQuietly(cfg, readTokens(cfg, row).accessToken, fetchImpl);
  } catch {
    revoked = false; // tokens unreadable: removing our copy still ends our access
  }
  db.prepare("DELETE FROM square_connection WHERE id = 1 AND merchant_id = ? AND tokens_cipher = ?").run(row.merchant_id, row.tokens_cipher);
  db.prepare("DELETE FROM square_oauth_states").run();
  resetSquareStatusCache();
  return ok({ disconnected: true, revoked });
}

/** Square told us the seller removed our access. */
export function clearSquareForRevokedMerchant(db, merchantId) {
  const res = db.prepare("DELETE FROM square_connection WHERE id = 1 AND merchant_id = ?").run(merchantId || "");
  resetSquareStatusCache();
  return res.changes > 0;
}

/** Operator-only: allow a different Square business to connect in this environment. */
export function clearMerchantLock(db, environment) {
  return db.prepare("DELETE FROM square_merchant_lock WHERE environment = ?").run(environment).changes > 0;
}
