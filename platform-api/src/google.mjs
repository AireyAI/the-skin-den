import { createPublicKey, verify as cryptoVerify } from "node:crypto";
import { config } from "./config.mjs";

const JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
let jwksCache = { at: 0, keys: [] };

async function fetchGoogleKeys() {
  if (Date.now() - jwksCache.at < 3600000 && jwksCache.keys.length) return jwksCache.keys;
  const res = await fetch(JWKS_URL);
  if (!res.ok) throw new Error("Could not fetch Google JWKS");
  const data = await res.json();
  jwksCache = { at: Date.now(), keys: data.keys || [] };
  return jwksCache.keys;
}

function decodePart(part) {
  return JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
}

export async function verifyGoogleIdToken(idToken) {
  const parts = idToken.split(".");
  if (parts.length !== 3) throw new Error("Invalid Google token");
  const header = decodePart(parts[0]);
  const payload = decodePart(parts[1]);
  const keys = await fetchGoogleKeys();
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) throw new Error("Google signing key not found");

  const key = createPublicKey({ key: jwk, format: "jwk" });
  const data = Buffer.from(`${parts[0]}.${parts[1]}`);
  const sig = Buffer.from(parts[2], "base64url");
  const ok = cryptoVerify("RSA-SHA256", data, key, sig);
  if (!ok) throw new Error("Google token signature invalid");

  const aud = config.googleClientId;
  if (aud && payload.aud !== aud) throw new Error("Google token audience mismatch");
  const issOk =
    payload.iss === "accounts.google.com" || payload.iss === "https://accounts.google.com";
  if (!issOk) throw new Error("Google token issuer invalid");
  if (payload.exp && payload.exp * 1000 < Date.now()) throw new Error("Google token expired");

  return {
    sub: payload.sub,
    email: payload.email || null,
    emailVerified: payload.email_verified === true || payload.email_verified === "true",
    name: payload.name || null
  };
}
