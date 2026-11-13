import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Seller tokens are stored encrypted with AES-256-GCM. The associated data binds each
 * ciphertext to one application, environment and merchant, so a row copied between
 * them cannot be decrypted.
 */
const VERSION = "v1";

const TAG_BYTES = 16;

export function validKey(keyB64) {
  const text = String(keyB64 || "");
  return /^[A-Za-z0-9+/]{43}=$/.test(text) && Buffer.from(text, "base64").length === 32;
}

function keyFrom(keyB64) {
  if (!validKey(keyB64)) throw new Error("Square token key must be 32 bytes (base64)");
  return Buffer.from(keyB64, "base64");
}

export function encryptTokens(keyB64, associatedData, value) {
  const key = keyFrom(keyB64);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv, { authTagLength: TAG_BYTES });
  cipher.setAAD(Buffer.from(associatedData, "utf8"));
  const body = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64url"), tag.toString("base64url"), body.toString("base64url")].join(".");
}

export function decryptTokens(keyB64, associatedData, blob) {
  const [version, iv, tag, body] = String(blob || "").split(".");
  if (version !== VERSION || !iv || !tag || !body) throw new Error("Unrecognised Square token format");
  const authTag = Buffer.from(tag, "base64url");
  if (authTag.length !== TAG_BYTES) throw new Error("Unrecognised Square token format");
  const decipher = createDecipheriv("aes-256-gcm", keyFrom(keyB64), Buffer.from(iv, "base64url"), { authTagLength: TAG_BYTES });
  decipher.setAAD(Buffer.from(associatedData, "utf8"));
  decipher.setAuthTag(authTag);
  const text = Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString("utf8");
  return JSON.parse(text);
}
