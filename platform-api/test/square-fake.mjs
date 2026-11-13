/**
 * In-memory stand-in for the Square API used by the Square tests. Each handler can be
 * overridden per test; every call is recorded so tests can assert what was sent.
 */
import { randomBytes } from "node:crypto";

export const TEST_KEY = randomBytes(32).toString("base64");

export function testEnv(overrides = {}) {
  return {
    SQUARE_ENVIRONMENT: "sandbox",
    SQUARE_APPLICATION_ID: "sandbox-sq0idb-skinden",
    SQUARE_APPLICATION_SECRET: "test-app-secret",
    SQUARE_TOKEN_ENCRYPTION_KEY: TEST_KEY,
    SQUARE_REDIRECT_URI: "http://localhost:4327/admin/",
    SQUARE_WEBHOOK_SIGNATURE_KEY: "test-signature-key",
    SQUARE_WEBHOOK_URL: "https://api.example.test/v1/square/webhook",
    ...overrides
  };
}

export function coach({ ageSec = 60, jti = "jti-1", sub = "coach-1" } = {}) {
  const now = Math.floor(Date.now() / 1000);
  return { sub, role: "coach", jti, iat: now - ageSec, exp: now + 3600 };
}

export function fakeSquare(overrides = {}) {
  const calls = [];
  const state = {
    merchantId: "MERCHANT_RACHEL",
    accessToken: "access-1",
    refreshToken: "refresh-1",
    expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
    scopes: ["MERCHANT_PROFILE_READ", "ORDERS_READ", "ORDERS_WRITE", "PAYMENTS_READ", "PAYMENTS_WRITE"],
    clientId: "sandbox-sq0idb-skinden",
    merchant: { id: "MERCHANT_RACHEL", status: "ACTIVE", country: "GB", business_name: "The Skin Den" },
    locations: [
      {
        id: "LOC_1",
        name: "The Skin Den Carlisle",
        merchant_id: "MERCHANT_RACHEL",
        status: "ACTIVE",
        country: "GB",
        currency: "GBP",
        capabilities: ["CREDIT_CARD_PROCESSING"]
      }
    ],
    ...overrides.state
  };

  const handlers = {
    "POST /oauth2/token": (body) => {
      if (body.grant_type === "authorization_code" && body.code !== "good-code") {
        return [400, { errors: [{ code: "INVALID_GRANT" }] }];
      }
      return [
        200,
        {
          access_token: state.accessToken,
          refresh_token: state.refreshToken,
          expires_at: state.expiresAt,
          merchant_id: state.merchantId,
          token_type: "bearer"
        }
      ];
    },
    "POST /oauth2/token/status": () => [
      200,
      { client_id: state.clientId, merchant_id: state.merchantId, scopes: state.scopes, expires_at: state.expiresAt }
    ],
    "POST /oauth2/revoke": () => [200, { success: true }],
    [`GET /v2/merchants/${"MERCHANT_RACHEL"}`]: () => [200, { merchant: state.merchant }],
    "GET /v2/locations": () => [200, { locations: state.locations }],
    ...overrides.handlers
  };

  async function fetchImpl(url, init = {}) {
    const u = new URL(url);
    const key = `${init.method || "GET"} ${u.pathname}`;
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ key, url: u, headers: init.headers || {}, body });
    let handler = handlers[key];
    if (!handler) {
      const prefix = Object.keys(handlers).find((k) => k.endsWith("*") && key.startsWith(k.slice(0, -1)));
      handler = prefix && handlers[prefix];
    }
    if (!handler) return response(404, { errors: [{ code: "NOT_FOUND" }] });
    const out = await handler(body, u, init);
    if (out instanceof Error) throw out;
    const [status, json] = out;
    return response(status, json);
  }

  return { fetchImpl, calls, state, handlers };
}

function response(status, json) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => json
  };
}
