import { createHmac, timingSafeEqual } from "node:crypto";
import { config } from "./config.mjs";

function signingKey() {
  return config.checkinHmacSecret || config.jwtSecret;
}

function signBody(body) {
  return createHmac("sha256", signingKey()).update(body).digest("base64url");
}

/**
 * Signed token encoding member + user ids.
 *
 * These expire. The original version did not, which made a screenshot of a member's
 * QR a permanent door key that could be forwarded to anyone. The account page mints
 * a fresh one on every load, so a short life costs the member nothing; wallet passes
 * are static once saved and so carry a longer one (config.walletTokenTtlSec) and get
 * re-issued on each scan.
 */
export function mintCheckinToken({ memberId, userId, ttlSec }) {
  if (!memberId || !userId) throw new Error("memberId and userId required for check-in token");
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    m: memberId,
    u: userId,
    v: 2,
    iat: now,
    exp: now + (Number(ttlSec) > 0 ? Number(ttlSec) : config.checkinTokenTtlSec)
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${signBody(body)}`;
}

/**
 * @returns payload, or null with a `reason` available via verifyCheckinTokenDetailed
 */
export function verifyCheckinToken(token) {
  return verifyCheckinTokenDetailed(token).payload;
}

/** Same check, but says *why* it failed so the coach sees "expired" not "tampered". */
export function verifyCheckinTokenDetailed(token) {
  if (!token || typeof token !== "string") return { payload: null, reason: "missing" };
  const trimmed = token.trim();
  const dot = trimmed.lastIndexOf(".");
  if (dot <= 0) return { payload: null, reason: "malformed" };
  const body = trimmed.slice(0, dot);
  const sig = trimmed.slice(dot + 1);
  const expected = signBody(body);
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return { payload: null, reason: "bad_signature" };
  } catch {
    return { payload: null, reason: "bad_signature" };
  }
  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return { payload: null, reason: "malformed" };
  }
  if (!payload?.m || !payload?.u) return { payload: null, reason: "malformed" };
  // v1 tokens predate expiry. They are still signed by us, but they never die, so
  // they are no longer accepted — members re-mint by opening their account page.
  if (payload.v !== 2) return { payload: null, reason: "outdated" };
  if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
    return { payload: null, reason: "expired" };
  }
  return { payload, reason: null };
}

export function checkinQrUrl(token) {
  const base = config.publicSiteOrigin.replace(/\/$/, "");
  return `${base}/v/checkin?t=${encodeURIComponent(token)}`;
}

/** Accept raw token or full QR URL. */
export function parseCheckinScan(raw) {
  return parseCheckinScanDetailed(raw).payload;
}

export function parseCheckinScanDetailed(raw) {
  if (!raw || typeof raw !== "string") return { payload: null, reason: "missing" };
  const s = raw.trim();
  if (s.includes("://")) {
    try {
      const u = new URL(s);
      const t = u.searchParams.get("t");
      if (t) return verifyCheckinTokenDetailed(t);
    } catch {
      /* fall through */
    }
  }
  return verifyCheckinTokenDetailed(s);
}
