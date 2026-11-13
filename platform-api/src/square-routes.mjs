import { authMiddleware } from "./auth-routes.mjs";
import { hit, clientKey } from "./rate-limit.mjs";
import { getDb } from "./db.mjs";
import { squareConfig, squareConfigProblems } from "./square-config.mjs";
import { startSquareConnect, completeSquareConnect, squareStatus, disconnectSquare, getConnectionRow, sellerAccess } from "./square-oauth.mjs";
import { createPaymentLink, listPaymentLinks, checkPaymentLink, handleSquareWebhook, checkWaitingLinks } from "./square-payments.mjs";

const requireCoach = authMiddleware("coach");

/** Studio-owner Square routes. Returns null for any other path. */
export async function handleSquareAdminRoutes(method, path, body, req) {
  if (!path.startsWith("/v1/admin/square/")) return null;
  const auth = requireCoach(req);
  if (auth.error) return { status: auth.status, json: { error: auth.error } };
  const db = getDb();
  const cfg = squareConfig();
  const coach = auth.payload;
  const limit = (name, max, windowMin) => {
    const gate = hit(`square-${name}:${coach.sub}:${clientKey(req)}`, { limit: max, windowMs: windowMin * 60000 });
    return gate.allowed ? null : { status: 429, json: { error: "Too many requests. Wait a moment and try again.", retryAfterSec: gate.retryAfterSec } };
  };

  if (method === "POST" && path === "/v1/admin/square/connect") return limit("connect", 10, 15) || startSquareConnect({ db, cfg, coach });
  if (method === "POST" && path === "/v1/admin/square/complete") return completeSquareConnect({ db, cfg, coach, input: body });
  if (method === "GET" && path === "/v1/admin/square/status") return squareStatus({ db, cfg });
  if (method === "POST" && path === "/v1/admin/square/disconnect") return disconnectSquare({ db, cfg, coach });
  if (method === "GET" && path === "/v1/admin/square/payment-links") return listPaymentLinks(db);
  if (method === "POST" && path === "/v1/admin/square/payment-links") return limit("create", 30, 10) || createPaymentLink({ db, cfg, input: body });
  const check = path.match(/^\/v1\/admin\/square\/payment-links\/(spl_[\w-]{1,64})\/check$/);
  if (method === "POST" && check) return limit("check", 60, 10) || checkPaymentLink({ db, cfg, id: check[1] });
  return { status: 404, json: { error: "Not found" } };
}

export function handleSquareWebhookRoute(req, raw) {
  return handleSquareWebhook({
    db: getDb(),
    cfg: squareConfig(),
    raw,
    signature: req.headers["x-square-hmacsha256-signature"]
  });
}

let timer = null;

/**
 * Daily, and once at boot: renew the seller's access when due and re-check links still
 * waiting for payment (a safety net for missed webhooks). Never throws.
 */
export function startSquareMaintenance({ everyMs = 24 * 3600 * 1000 } = {}) {
  if (timer) return timer;
  const tick = async () => {
    const cfg = squareConfig();
    const db = getDb();
    if (squareConfigProblems(cfg).length || !getConnectionRow(db)) return;
    try {
      await sellerAccess({ db, cfg });
      const checked = await checkWaitingLinks({ db, cfg });
      if (checked) console.log(`[square] checked ${checked} waiting payment link(s)`);
    } catch (e) {
      console.error(`[square] maintenance failed: ${e.message}. The dashboard will ask to reconnect if access is lost.`);
    }
  };
  void tick();
  timer = setInterval(() => void tick(), everyMs);
  timer.unref?.();
  return timer;
}
