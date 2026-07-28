import { createServer } from "node:http";
import { config, warnProductionSecrets } from "./config.mjs";
import { getDb, warnIfMultiReplica } from "./db.mjs";
import { ensureCoachAccount, seedMembersIfEmpty, purgeDemoMemberships, handleAuthRoutes, getMemberProfile, getMemberBookings } from "./auth-routes.mjs";
import {
  getAdminDashboard,
  postMemberContacted,
  getAdminBookings,
  getAdminPayments,
  getAdminStripeStatus,
  postMemberLink,
  postMemberUnlink,
  postMemberCredits,
  postAdminMember,
  getAdminUnlinked,
  getAdminBackups,
  postAdminBackup
} from "./admin-routes.mjs";
import { startBackupSchedule } from "./backup.mjs";

function corsHeaders(origin) {
  const allowed = config.corsOrigins;
  // Never pair a wildcard with credentials, and never echo an origin we do not know.
  const o = allowed.includes(origin) ? origin : allowed[0] || "";
  const headers = {
    "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": "true",
    Vary: "Origin"
  };
  if (o) headers["Access-Control-Allow-Origin"] = o;
  return headers;
}

const BODY_TOO_LARGE = Symbol("body-too-large");

async function readRawLimited(req) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > config.maxBodyBytes) {
      req.destroy();
      return BODY_TOO_LARGE;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function readJson(req) {
  const raw = await readRawLimited(req);
  if (raw === BODY_TOO_LARGE) return BODY_TOO_LARGE;
  const text = raw.toString("utf8");
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function send(res, status, json, origin) {
  const body = JSON.stringify(json);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...corsHeaders(origin)
  });
  res.end(body);
}

async function route(req, res) {
  const origin = req.headers.origin || "";
  if (req.method === "OPTIONS") {
    res.writeHead(204, corsHeaders(origin));
    res.end();
    return;
  }

  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const path = url.pathname.replace(/\/$/, "") || "/";

  if (req.method === "POST" && path === "/v1/stripe/webhook") {
    const raw = await readRawLimited(req);
    if (raw === BODY_TOO_LARGE) {
      send(res, 413, { error: "Payload too large" }, origin);
      return;
    }
    const { handleStripeWebhook } = await import("./stripe-webhook.mjs");
    const result = handleStripeWebhook(req, raw);
    send(res, result.status, result.json, origin);
    return;
  }

  if (req.method === "GET" && path === "/v1/public/config") {
    const { getPublicConfig } = await import("./public-config.mjs");
    send(res, 200, getPublicConfig(), origin);
    return;
  }

  if (req.method === "GET" && path === "/health") {
    send(res, 200, { ok: true, service: "the-skin-den-platform", tenant: process.env.KK_TENANT_SLUG || "the-skin-den" }, origin);
    return;
  }

  const body = req.method === "POST" || req.method === "PUT" ? await readJson(req) : {};
  if (body === BODY_TOO_LARGE) {
    send(res, 413, { error: "Payload too large" }, origin);
    return;
  }
  if (body === null) {
    send(res, 400, { error: "Invalid JSON" }, origin);
    return;
  }

  const authResult = await handleAuthRoutes(req.method, path, body, req);
  if (authResult) {
    send(res, authResult.status, authResult.json, origin);
    return;
  }

  if (req.method === "GET" && path === "/v1/public/schedule/instances") {
    const { getPublicScheduleInstancesHandler } = await import("./booking-routes.mjs");
    const result = getPublicScheduleInstancesHandler(req);
    send(res, result.status, result.json, origin);
    return;
  }

  if (req.method === "GET" && path === "/v1/public/schedule") {
    const { getPublicScheduleHandler } = await import("./booking-routes.mjs");
    const result = getPublicScheduleHandler();
    send(res, result.status, result.json, origin);
    return;
  }

  if (req.method === "GET" && path === "/v1/public/payments-status") {
    const { getPublicPaymentsStatusHandler } = await import("./booking-routes.mjs");
    try {
      const result = await getPublicPaymentsStatusHandler();
      send(res, result.status, result.json, origin);
    } catch (e) {
      send(res, 500, { error: e.message || "Status check failed" }, origin);
    }
    return;
  }

  if (req.method === "POST" && path === "/v1/public/bookings/checkout") {
    const { postPublicCheckout } = await import("./booking-routes.mjs");
    try {
      const result = await postPublicCheckout(body, req);
      send(res, result.status, result.json, origin);
    } catch (e) {
      send(res, 500, { error: e.message || "Checkout failed" }, origin);
    }
    return;
  }

  if (req.method === "GET" && path === "/v1/public/products") {
    const { getPublicProductsHandler } = await import("./membership-routes.mjs");
    const result = getPublicProductsHandler();
    send(res, result.status, result.json, origin);
    return;
  }

  if (req.method === "POST" && path === "/v1/public/memberships/checkout") {
    const { postProductCheckout } = await import("./membership-routes.mjs");
    try {
      const result = await postProductCheckout(body, req);
      send(res, result.status, result.json, origin);
    } catch (e) {
      send(res, 500, { error: e.message || "Checkout failed" }, origin);
    }
    return;
  }

  if (req.method === "GET" && path === "/v1/admin/schedule") {
    const { getAdminSchedule } = await import("./booking-routes.mjs");
    const result = getAdminSchedule(req);
    send(res, result.status, result.json, origin);
    return;
  }

  if (req.method === "POST" && path === "/v1/admin/schedule/reset-from-seed") {
    const { postAdminScheduleReset } = await import("./booking-routes.mjs");
    const result = postAdminScheduleReset(req);
    send(res, result.status, result.json, origin);
    return;
  }

  if (req.method === "PUT" && path === "/v1/admin/schedule") {
    const { putAdminSchedule } = await import("./booking-routes.mjs");
    const result = putAdminSchedule(req, body);
    send(res, result.status, result.json, origin);
    return;
  }

  if (req.method === "POST" && path === "/v1/admin/stripe/connect-link") {
    const { postStripeConnectLink } = await import("./booking-routes.mjs");
    try {
      const result = await postStripeConnectLink(req);
      send(res, result.status, result.json, origin);
    } catch (e) {
      send(res, 500, { error: e.message || "Stripe Connect failed" }, origin);
    }
    return;
  }

  if (req.method === "GET" && path === "/v1/member/me") {
    const result = getMemberProfile(req);
    send(res, result.status, result.json, origin);
    return;
  }

  if (req.method === "POST" && path === "/v1/member/bookings/reserve") {
    const { postMemberBookWithCredit } = await import("./booking-routes.mjs");
    try {
      const body = await readJsonBody(req);
      const result = postMemberBookWithCredit(body, req);
      send(res, result.status, result.json, origin);
    } catch (e) {
      send(res, 500, { error: e.message || "Booking failed" }, origin);
    }
    return;
  }

  if (req.method === "GET" && path === "/v1/member/bookings") {
    const result = getMemberBookings(req);
    send(res, result.status, result.json, origin);
    return;
  }

  const memberBookingReschedule = path.match(/^\/v1\/member\/bookings\/([^/]+)$/);
  if (req.method === "PATCH" && memberBookingReschedule) {
    const { patchMemberBookingReschedule } = await import("./booking-routes.mjs");
    const result = await patchMemberBookingReschedule(memberBookingReschedule[1], body, req);
    send(res, result.status, result.json, origin);
    return;
  }

  if (req.method === "GET" && path === "/v1/member/billing") {
    const { getMemberBilling } = await import("./membership-routes.mjs");
    const result = getMemberBilling(req);
    send(res, result.status, result.json, origin);
    return;
  }

  if (req.method === "POST" && path === "/v1/member/billing/portal") {
    const { postMemberBillingPortal } = await import("./membership-routes.mjs");
    try {
      const result = await postMemberBillingPortal(req);
      send(res, result.status, result.json, origin);
    } catch (e) {
      send(res, 500, { error: e.message || "Billing portal failed" }, origin);
    }
    return;
  }

  if (req.method === "GET" && path === "/v1/member/wallet/google") {
    const { getMemberGoogleWallet } = await import("./wallet-routes.mjs");
    try {
      const result = await getMemberGoogleWallet(req);
      send(res, result.status, result.json, origin);
    } catch (e) {
      send(res, 500, { error: e.message || "Google Wallet failed" }, origin);
    }
    return;
  }

  if (req.method === "GET" && path === "/v1/member/check-in-qr") {
    const { getMemberCheckInQr } = await import("./checkin-routes.mjs");
    const result = await getMemberCheckInQr(req);
    send(res, result.status, result.json, origin);
    return;
  }

  if (req.method === "GET" && path === "/v1/member/wallet/apple-link") {
    const { getMemberAppleWalletLink } = await import("./apple-wallet.mjs");
    try {
      const result = getMemberAppleWalletLink(req);
      send(res, result.status, result.json, origin);
    } catch (e) {
      send(res, 500, { error: e.message || "Apple Wallet link failed" }, origin);
    }
    return;
  }

  if (req.method === "GET" && path === "/v1/member/wallet/apple") {
    const { getMemberAppleWallet } = await import("./apple-wallet.mjs");
    try {
      const result = await getMemberAppleWallet(req);
      if (result.buffer) {
        res.writeHead(result.status, {
          ...corsHeaders(origin),
          "Content-Type": "application/vnd.apple.pkpass",
          "Content-Disposition": 'inline; filename="kettle-kulture-member.pkpass"'
        });
        res.end(result.buffer);
        return;
      }
      send(res, result.status, result.json, origin);
    } catch (e) {
      send(res, 500, { error: e.message || "Apple Wallet failed" }, origin);
    }
    return;
  }

  if (req.method === "POST" && path === "/v1/admin/check-in") {
    const { postAdminCheckIn } = await import("./checkin-routes.mjs");
    try {
      const result = await postAdminCheckIn(req, body);
      send(res, result.status, result.json, origin);
    } catch (e) {
      send(res, 500, { error: e.message || "Check-in failed" }, origin);
    }
    return;
  }

  if (req.method === "GET" && path === "/v1/admin/check-ins") {
    const { getAdminCheckIns } = await import("./checkin-routes.mjs");
    const result = getAdminCheckIns(req);
    send(res, result.status, result.json, origin);
    return;
  }

  if (req.method === "GET" && path === "/v1/admin/dashboard") {
    const result = await getAdminDashboard(req);
    send(res, result.status, result.json, origin);
    return;
  }

  if (req.method === "GET" && path === "/v1/admin/bookings/roster") {
    const { getAdminBookingsRoster } = await import("./booking-routes.mjs");
    const result = await getAdminBookingsRoster(req);
    send(res, result.status, result.json, origin);
    return;
  }

  const adminBookingReschedule = path.match(/^\/v1\/admin\/bookings\/([^/]+)\/reschedule$/);
  if (req.method === "PATCH" && adminBookingReschedule) {
    const { patchAdminBookingReschedule } = await import("./booking-routes.mjs");
    const result = patchAdminBookingReschedule(adminBookingReschedule[1], body, req);
    send(res, result.status, result.json, origin);
    return;
  }

  if (req.method === "GET" && path === "/v1/admin/bookings") {
    const result = getAdminBookings(req);
    send(res, result.status, result.json, origin);
    return;
  }

  if (req.method === "GET" && path === "/v1/admin/payments") {
    const result = getAdminPayments(req);
    send(res, result.status, result.json, origin);
    return;
  }

  if (req.method === "GET" && path === "/v1/admin/stripe/status") {
    const result = await getAdminStripeStatus(req);
    send(res, result.status, result.json, origin);
    return;
  }

  if (req.method === "GET" && path === "/v1/admin/members/unlinked") {
    const result = getAdminUnlinked(req);
    send(res, result.status, result.json, origin);
    return;
  }

  if (req.method === "POST" && path === "/v1/admin/members") {
    const result = postAdminMember(req, body);
    send(res, result.status, result.json, origin);
    return;
  }

  if (req.method === "GET" && path === "/v1/admin/backups") {
    const result = getAdminBackups(req);
    send(res, result.status, result.json, origin);
    return;
  }

  if (req.method === "POST" && path === "/v1/admin/backups") {
    const result = postAdminBackup(req);
    send(res, result.status, result.json, origin);
    return;
  }

  const memberAction = path.match(/^\/v1\/admin\/members\/([^/]+)\/(contacted|link|unlink|credits)$/);
  if (req.method === "POST" && memberAction) {
    const [, memberId, action] = memberAction;
    const handler = {
      contacted: () => postMemberContacted(req, memberId),
      link: () => postMemberLink(req, memberId, body),
      unlink: () => postMemberUnlink(req, memberId),
      credits: () => postMemberCredits(req, memberId, body)
    }[action];
    const result = handler();
    send(res, result.status, result.json, origin);
    return;
  }

  send(res, 404, { error: "Not found" }, origin);
}

export function bootstrap() {
  warnProductionSecrets();
  warnIfMultiReplica();
  const database = getDb();
  ensureCoachAccount(database);
  purgeDemoMemberships(database);
  seedMembersIfEmpty(database);
  return database;
}

/**
 * Boot-time Stripe health check — catches the three silent killers:
 * 1. rk_ key (restricted, can't access Connect accounts)
 * 2. Stale/orphan Connect account ID
 * 3. Webhook secret from wrong mode (test secret on live endpoint = every webhook 400s)
 *
 * Runs once at startup; logs warnings but never blocks boot.
 */
async function stripeBootHealthCheck() {
  const { getStripe, stripeSecretKeyProblem } = await import("./stripe-client.mjs");
  const { getStripeConnectAccountId, isStaleConnectAccountError, clearStripeConnectAccountId, setStripeConnectAccountId } = await import("./tenant-settings.mjs");
  const { clearConnectStatusCache } = await import("./stripe-status.mjs");
  const { createExpressConnectAccount } = await import("./stripe-client.mjs");

  const keyProblem = stripeSecretKeyProblem();
  if (keyProblem) { console.error(`[platform-api] BOOT HEALTH: ${keyProblem}`); return; }
  if (config.stripeSecretKey.startsWith("rk_")) {
    console.error("[platform-api] BOOT HEALTH: STRIPE_SECRET_KEY is restricted (rk_). Connect and payouts will fail.");
    return;
  }

  const stripe = getStripe();
  if (!stripe) { console.error("[platform-api] BOOT HEALTH: Stripe client could not be initialised."); return; }

  let connectId = getStripeConnectAccountId();
  if (connectId) {
    try {
      const acct = await stripe.accounts.retrieve(connectId);
      const transfers = acct.capabilities?.transfers;
      const live = !!acct.charges_enabled && (transfers === "active" || acct.capabilities?.legacy_payments === "active");
      console.log(`[platform-api] BOOT HEALTH: Connect ${connectId} — charges=${acct.charges_enabled} payouts=${acct.payouts_enabled} transfers=${transfers} live=${live}`);
      if (!live) console.warn(`[platform-api] BOOT HEALTH: Connect ${connectId} NOT fully live. Admin → Set up payouts.`);
    } catch (e) {
      if (isStaleConnectAccountError(e.message)) {
        console.warn(`[platform-api] BOOT HEALTH: Connect ${connectId} stale — auto-healing.`);
        try {
          clearStripeConnectAccountId();
          const account = await createExpressConnectAccount(config.coachEmail);
          setStripeConnectAccountId(account.id);
          clearConnectStatusCache();
          console.log(`[platform-api] BOOT HEALTH: New Connect account: ${account.id}`);
        } catch (ce) { console.error(`[platform-api] BOOT HEALTH: Heal failed: ${ce.message}`); }
      } else { console.error(`[platform-api] BOOT HEALTH: Connect lookup failed: ${e.message}`); }
    }
  } else { console.warn("[platform-api] BOOT HEALTH: No Connect account ID."); }

  if (!config.stripeWebhookSecret) {
    console.error("[platform-api] BOOT HEALTH: STRIPE_WEBHOOK_SECRET empty — no webhook verifies, no payment activates.");
  } else if (!config.stripeWebhookSecret.startsWith("whsec_")) {
    console.error("[platform-api] BOOT HEALTH: STRIPE_WEBHOOK_SECRET not whsec_…");
  } else { console.log("[platform-api] BOOT HEALTH: Webhook secret present."); }
}

export function startServer() {
  bootstrap();
  startBackupSchedule();
  stripeBootHealthCheck().catch((e) => console.error("[platform-api] BOOT HEALTH crashed:", e.message));
  const server = createServer((req, res) => {
    route(req, res).catch((err) => {
      console.error(err);
      send(res, 500, { error: "Internal error" }, req.headers.origin || "");
    });
  });
  server.listen(config.port, () => {
    console.log(`Kettle Kulture platform API http://localhost:${config.port}`);
    import("./apple.mjs").then((m) => m.warmAppleJwks?.()).catch(() => {});
  });
  return server;
}

import { fileURLToPath } from "node:url";

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  startServer();
}
