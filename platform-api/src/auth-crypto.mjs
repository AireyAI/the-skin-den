import { createHmac, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";

const SCRYPT_OPTS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export function hashPassword(password) {
  const salt = randomUUID().replace(/-/g, "");
  const hash = scryptSync(password, salt, 64, SCRYPT_OPTS);
  return `${salt}:${hash.toString("hex")}`;
}

export function verifyPassword(password, stored) {
  const [salt, hex] = stored.split(":");
  if (!salt || !hex) return false;
  const hash = scryptSync(password, salt, 64, SCRYPT_OPTS);
  const expected = Buffer.from(hex, "hex");
  if (hash.length !== expected.length) return false;
  return timingSafeEqual(hash, expected);
}

function b64url(input) {
  return Buffer.from(input).toString("base64url");
}

function signJwt(payload, secret, ttlSec) {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const body = { ...payload, iat: now, exp: now + ttlSec };
  const head = b64url(JSON.stringify(header));
  const bod = b64url(JSON.stringify(body));
  const data = `${head}.${bod}`;
  const sig = createHmac("sha256", secret).update(data).digest("base64url");
  return `${data}.${sig}`;
}

export function verifyJwt(token, secret) {
  if (typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [head, bod, sig] = parts;
  // The signature below is always recomputed as HS256 regardless of what the header
  // claims, so "alg": "none" cannot work — but reject it explicitly so that stays
  // true if this ever changes.
  try {
    const header = JSON.parse(Buffer.from(head, "base64url").toString("utf8"));
    if (header?.alg !== "HS256") return null;
  } catch {
    return null;
  }
  const data = `${head}.${bod}`;
  const expected = createHmac("sha256", secret).update(data).digest("base64url");
  if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    return null;
  }
  let payload;
  try {
    payload = JSON.parse(Buffer.from(bod, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

// A year-long admin token with no revocation is a year-long window on the whole
// member list if a coach's laptop or browser profile is ever compromised. A week
// means one sign-in a week on the studio tablet.
export function issueCoachToken(coachId, secret, ttlSec = 60 * 60 * 24 * 7) {
  return signJwt({ sub: coachId, role: "coach", jti: randomUUID() }, secret, ttlSec);
}

export function issueMemberToken(userId, secret) {
  return signJwt({ sub: userId, role: "member", jti: randomUUID() }, secret, 60 * 60 * 24 * 30);
}

/** Short-lived token for Safari / Wallet to open a .pkpass URL without a Bearer header. */
export function issuePassDownloadToken(userId, secret, ttlSec = 300) {
  return signJwt(
    { sub: userId, role: "member", purpose: "apple_pass_dl", jti: randomUUID() },
    secret,
    ttlSec
  );
}

export function parseBearer(req) {
  const h = req.headers.authorization || req.headers.Authorization;
  if (!h || !h.startsWith("Bearer ")) return null;
  return h.slice(7).trim();
}
