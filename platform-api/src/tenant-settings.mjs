import { getDb } from "./db.mjs";
import { config } from "./config.mjs";

const CONNECT_KEY = "stripe_connect_account_id";

/** DB wins (admin/onboarding updates); env is bootstrap when DB empty. */
export function getStripeConnectAccountId() {
  try {
    const row = getDb()
      .prepare("SELECT value FROM tenant_settings WHERE key = ?")
      .get(CONNECT_KEY);
    const fromDb = row?.value?.trim();
    if (fromDb) return fromDb;
  } catch {
    /* volume / migration */
  }
  return config.stripeConnectAccountId?.trim() || "";
}

export function setStripeConnectAccountId(accountId) {
  const id = String(accountId || "").trim();
  if (!id.startsWith("acct_")) throw new Error("Invalid Connect account id");
  getDb()
    .prepare(
      `INSERT INTO tenant_settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    )
    .run(CONNECT_KEY, id, new Date().toISOString());
}

/** Drop DB override so env / fresh onboarding can supply a valid Connect account. */
export function clearStripeConnectAccountId() {
  try {
    getDb().prepare("DELETE FROM tenant_settings WHERE key = ?").run(CONNECT_KEY);
  } catch {
    /* volume / migration */
  }
}

export function isStaleConnectAccountError(message) {
  const msg = String(message || "");
  return /does not have access to account/i.test(msg) || /No such account/i.test(msg);
}
