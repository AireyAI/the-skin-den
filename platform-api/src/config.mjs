import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadDotEnv() {
  const path = join(root, ".env");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

loadDotEnv();

const DEV_JWT_SECRET = "dev-change-me-before-production";
const DEV_COACH_PASSWORD = "kk-studio-dev";

export const config = {
  port: Number(process.env.PORT || 3220),
  jwtSecret: process.env.KK_JWT_SECRET || DEV_JWT_SECRET,
  checkinHmacSecret: process.env.KK_CHECKIN_HMAC_SECRET || process.env.KK_JWT_SECRET || DEV_JWT_SECRET,
  coachEmail: (process.env.KK_COACH_EMAIL || "kettle.kulture@outlook.com").toLowerCase(),
  coachPassword: process.env.KK_COACH_PASSWORD || DEV_COACH_PASSWORD,
  appleClientId: process.env.APPLE_CLIENT_ID || "",
  googleClientId: process.env.GOOGLE_CLIENT_ID || "",
  googleWalletIssuerId: process.env.GOOGLE_WALLET_ISSUER_ID || "",
  googleWalletServiceAccount: process.env.GOOGLE_WALLET_SERVICE_ACCOUNT_JSON || "",
  googleWalletServiceAccountEmail: process.env.GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL || "",
  googleWalletDelegateCredentialsJson: process.env.GOOGLE_WALLET_DELEGATED_CREDENTIALS_JSON || "",
  googleWalletProxyUrl: (process.env.GOOGLE_WALLET_PROXY_URL || "").replace(/\/$/, ""),
  googleWalletProxySecret: process.env.GOOGLE_WALLET_PROXY_SECRET || "",
  googleWalletClassSuffix: (process.env.GOOGLE_WALLET_CLASS_SUFFIX || process.env.KK_TENANT_SLUG || "loyalty").replace(
    /-/g,
    "_"
  ),
  googleWalletIssuerName: process.env.GOOGLE_WALLET_ISSUER_NAME || "Studio membership",
  googleWalletProgramName: process.env.GOOGLE_WALLET_PROGRAM_NAME || "Member pass",
  googleWalletLogoUrl: process.env.GOOGLE_WALLET_LOGO_URL || "",
  googleWalletHeroUrl: process.env.GOOGLE_WALLET_HERO_URL || "",
  googleWalletBrandColor: process.env.GOOGLE_WALLET_BRAND_COLOR || "#03191d",
  googleWalletOrigins: (process.env.GOOGLE_WALLET_ORIGINS || process.env.KK_PUBLIC_SITE_ORIGIN || "")
    .split(",")
    .map((s) => s.trim().replace(/\/$/, ""))
    .filter(Boolean),
  allowDevAuth: process.env.KK_ALLOW_DEV_AUTH === "true",
  corsOrigins: (process.env.KK_CORS_ORIGINS || "http://localhost:3000")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  dataDir: process.env.KK_DATA_DIR || join(root, "data"),
  dbPath: join(root, "data", "kettle-kulture.sqlite"),
  stripeSecretKey: process.env.STRIPE_SECRET_KEY || "",
  stripeConnectAccountId: process.env.STRIPE_CONNECT_ACCOUNT_ID || "",
  platformFeeBps: Number(process.env.PLATFORM_FEE_BPS || 500),
  tenantSlug: process.env.KK_TENANT_SLUG || "kettle-kulture",
  studioName: process.env.KK_STUDIO_NAME || "Kettle Kulture",
  studioDescription:
    process.env.KK_STUDIO_DESCRIPTION || "Coached kettlebell classes and memberships",
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || "",

  applePassTypeId: process.env.APPLE_PASS_TYPE_ID || "",
  appleTeamId: process.env.APPLE_TEAM_ID || "",
  applePassCertPem: process.env.APPLE_PASS_CERT_PEM || "",
  applePassKeyPem: process.env.APPLE_PASS_KEY_PEM || "",
  applePassKeyPassphrase: process.env.APPLE_PASS_KEY_PASSPHRASE || "",
  appleWwdrPem: process.env.APPLE_WWDR_CERT_PEM || "",
  applePassOrgName: process.env.APPLE_PASS_ORG_NAME || "Kettle Kulture",
  applePassDescription: process.env.APPLE_PASS_DESCRIPTION || "Kettle Kulture membership",
  applePassLogoText: process.env.APPLE_PASS_LOGO_TEXT || "Kettle Kulture",
  /** Matches Higgsfield strip edge — teal-charcoal, not flat black */
  applePassBackgroundColor: process.env.APPLE_PASS_BACKGROUND_COLOR || "rgb(3, 25, 29)",
  applePassForegroundColor: process.env.APPLE_PASS_FOREGROUND_COLOR || "rgb(244, 242, 236)",
  applePassLabelColor: process.env.APPLE_PASS_LABEL_COLOR || "rgb(62, 240, 212)",
  publicSiteOrigin: process.env.KK_PUBLIC_SITE_ORIGIN || "https://kettle-kulture.vercel.app",

  /** Door QR lifetime. Short so a leaked screenshot stops working; the account page re-mints on load. */
  checkinTokenTtlSec: Number(process.env.KK_CHECKIN_TOKEN_TTL_SEC || 60 * 60 * 24 * 7),
  /** Wallet passes are static once saved, so they carry a longer token and refresh on each scan. */
  walletTokenTtlSec: Number(process.env.KK_WALLET_TOKEN_TTL_SEC || 60 * 60 * 24 * 180),
  /** Unpaid checkout sessions stop holding a class seat after this long. */
  bookingHoldMinutes: Number(process.env.KK_BOOKING_HOLD_MINUTES || 30),
  /** Cache window for the Stripe Connect capability lookup that gates every checkout. */
  connectStatusCacheMs: Number(process.env.KK_CONNECT_STATUS_CACHE_MS || 60_000),
  /** Hard cap on request bodies (no endpoint legitimately needs more). */
  maxBodyBytes: Number(process.env.KK_MAX_BODY_BYTES || 256 * 1024),
  /** Nightly SQLite snapshots; 0 disables. */
  backupIntervalHours: Number(process.env.KK_BACKUP_INTERVAL_HOURS || 24),
  backupKeep: Number(process.env.KK_BACKUP_KEEP || 14),

  ga4MeasurementId: process.env.GA4_MEASUREMENT_ID || "",
  ga4PropertyId: process.env.GA4_PROPERTY_ID || "",
  ga4ServiceAccountJson: process.env.GA4_SERVICE_ACCOUNT_JSON || "",
  ga4ReportUrl: process.env.GA4_REPORT_URL || ""
};

const dbFileName = `${config.tenantSlug}.sqlite`;
config.dbPath = process.env.KK_DATA_DIR
  ? join(process.env.KK_DATA_DIR, dbFileName)
  : join(root, "data", dbFileName);


export function isProduction() {
  return (
    process.env.NODE_ENV === "production" ||
    process.env.RAILWAY_ENVIRONMENT === "production" ||
    process.env.RAILWAY_ENVIRONMENT === "staging"
  );
}

/**
 * Refuse to boot in production with development secrets. A warning in the Railway
 * log is not a control — the default JWT secret is committed to this repo, so
 * running with it means anyone can mint a coach token and a door pass.
 */
export function warnProductionSecrets() {
  if (!isProduction()) {
    console.log(`[platform-api] dev mode · db=${config.dbPath}`);
    return;
  }

  const fatal = [];
  if (!process.env.KK_JWT_SECRET || config.jwtSecret === DEV_JWT_SECRET) {
    fatal.push("KK_JWT_SECRET is unset or still the committed development value");
  }
  if (!process.env.KK_COACH_PASSWORD || config.coachPassword === DEV_COACH_PASSWORD) {
    fatal.push("KK_COACH_PASSWORD is unset or still the committed development value");
  }
  if (config.allowDevAuth) {
    fatal.push("KK_ALLOW_DEV_AUTH is enabled — mock sign-in tokens would be accepted");
  }
  if (fatal.length) {
    console.error("[platform-api] refusing to start in production:");
    for (const f of fatal) console.error(`  · ${f}`);
    throw new Error(`Unsafe production configuration: ${fatal.length} issue(s)`);
  }

  // Not fatal, but each one silently breaks a business flow.
  const warn = [];
  if (!process.env.KK_DATA_DIR) {
    warn.push(
      `KK_DATA_DIR is unset — the database is at ${config.dbPath}. If no Railway volume is ` +
        "mounted there, every member, credit balance and check-in is lost on redeploy."
    );
  }
  if (!config.stripeSecretKey) warn.push("STRIPE_SECRET_KEY unset — all checkout returns 503");
  else if (config.stripeSecretKey.startsWith("rk_")) {
    warn.push(
      "STRIPE_SECRET_KEY is a restricted key (rk_) — Checkout needs the full platform secret (sk_live_…)"
    );
  }
  if (!config.stripeConnectAccountId) {
    warn.push("STRIPE_CONNECT_ACCOUNT_ID unset — all checkout returns 503");
  }
  if (!config.stripeWebhookSecret) {
    warn.push("STRIPE_WEBHOOK_SECRET unset — webhooks return 503, so no purchase ever activates");
  }
  for (const w of warn) console.warn(`[platform-api] WARNING: ${w}`);
  console.log(`[platform-api] production · db=${config.dbPath} · tenant=${config.tenantSlug} · payments=connect-required`);
}
