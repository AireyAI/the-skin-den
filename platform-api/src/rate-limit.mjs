/**
 * In-memory fixed-window rate limiter.
 *
 * Deliberately not a dependency and not shared state: this API runs as a single
 * process against a single SQLite file, so a per-process counter is exactly as
 * accurate as anything else here. If the service is ever scaled past one replica
 * this needs to move to the database (as does the database itself).
 */

const buckets = new Map();
let lastSweep = Date.now();

function sweep(now) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(key);
  }
}

/**
 * @returns {{allowed: boolean, retryAfterSec: number, remaining: number}}
 */
export function hit(key, { limit, windowMs }) {
  const now = Date.now();
  sweep(now);
  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSec: 0, remaining: limit - 1 };
  }
  existing.count += 1;
  if (existing.count > limit) {
    return {
      allowed: false,
      retryAfterSec: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
      remaining: 0
    };
  }
  return { allowed: true, retryAfterSec: 0, remaining: limit - existing.count };
}

/** Clear a bucket after a success so honest users are never punished for a typo. */
export function reset(key) {
  buckets.delete(key);
}

/**
 * Best-effort client identity. Railway terminates TLS upstream, so the socket address
 * is the proxy — trust the leftmost x-forwarded-for hop when present.
 */
export function clientKey(req) {
  const fwd = req?.headers?.["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.length) return fwd.split(",")[0].trim();
  return req?.socket?.remoteAddress || "unknown";
}

export function limited(json, retryAfterSec) {
  return { status: 429, json: { error: json, retryAfterSec } };
}

/** Test seam. */
export function _clearAll() {
  buckets.clear();
}
