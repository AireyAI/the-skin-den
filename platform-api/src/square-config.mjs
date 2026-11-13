import { isProduction } from "./config.mjs";
import { validKey } from "./square-crypto.mjs";

/** Pinned API version, matching the working Peaceful Petals integration. */
export const SQUARE_VERSION = "2026-09-16";

export const SQUARE_SCOPES = [
  "MERCHANT_PROFILE_READ",
  "ORDERS_READ",
  "ORDERS_WRITE",
  "PAYMENTS_READ",
  "PAYMENTS_WRITE"
];

/**
 * Square settings are read when used (not at import) so tests and a redeploy with new
 * variables see the current values. Nothing here is ever sent to the browser.
 */
export function squareConfig(env = process.env, { production = isProduction() } = {}) {
  const environment = env.SQUARE_ENVIRONMENT || "";
  return {
    production,
    environment,
    applicationId: env.SQUARE_APPLICATION_ID || "",
    applicationSecret: env.SQUARE_APPLICATION_SECRET || "",
    encryptionKey: env.SQUARE_TOKEN_ENCRYPTION_KEY || "",
    redirectUri: env.SQUARE_REDIRECT_URI || "",
    webhookSignatureKey: env.SQUARE_WEBHOOK_SIGNATURE_KEY || "",
    webhookUrl: env.SQUARE_WEBHOOK_URL || "",
    apiBase:
      environment === "production" ? "https://connect.squareup.com" : "https://connect.squareupsandbox.com"
  };
}

function isHttps(value) {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

/** Every reason Square cannot be used, by variable name. Empty means ready. */
export function squareConfigProblems(cfg) {
  const problems = [];
  if (!["production", "sandbox"].includes(cfg.environment)) {
    problems.push("SQUARE_ENVIRONMENT must be production or sandbox");
  } else if (cfg.production && cfg.environment !== "production") {
    problems.push("SQUARE_ENVIRONMENT must be production on the live server");
  }
  if (!cfg.applicationId) problems.push("SQUARE_APPLICATION_ID is not set");
  if (!cfg.applicationSecret) problems.push("SQUARE_APPLICATION_SECRET is not set");
  if (!validKey(cfg.encryptionKey)) {
    problems.push("SQUARE_TOKEN_ENCRYPTION_KEY must be 32 random bytes in base64");
  }
  if (!cfg.redirectUri) problems.push("SQUARE_REDIRECT_URI is not set");
  else if (cfg.production && !isHttps(cfg.redirectUri)) problems.push("SQUARE_REDIRECT_URI must use https");
  if (!cfg.webhookSignatureKey) problems.push("SQUARE_WEBHOOK_SIGNATURE_KEY is not set");
  if (!cfg.webhookUrl) problems.push("SQUARE_WEBHOOK_URL is not set");
  else if (cfg.production && !isHttps(cfg.webhookUrl)) problems.push("SQUARE_WEBHOOK_URL must use https");
  return problems;
}
