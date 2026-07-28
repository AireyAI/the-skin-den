import { getDb, membershipForUser } from "./db.mjs";
import { isGoogleWalletEnabled, upsertGoogleWalletObject } from "./google-wallet.mjs";

function userFromRow(row) {
  if (!row) return null;
  return { id: row.id, email: row.email, name: row.name };
}

/** Push latest QR + class balance to Google Wallet (best-effort). */
export async function syncWalletPassesForUserId(userId) {
  if (!userId || !isGoogleWalletEnabled()) return { skipped: true };
  const database = getDb();
  const user = userFromRow(
    database.prepare("SELECT id, email, name FROM users WHERE id = ?").get(userId)
  );
  if (!user) return { skipped: true, reason: "no_user" };
  const membership = membershipForUser(database, userId);
  await upsertGoogleWalletObject({ user, membership });
  return { ok: true };
}

export async function syncWalletPassesForStripeCustomer(stripeCustomerId) {
  if (!stripeCustomerId) return { skipped: true };
  const database = getDb();
  const row = database
    .prepare("SELECT user_id FROM memberships WHERE stripe_customer_id = ? LIMIT 1")
    .get(stripeCustomerId);
  if (!row?.user_id) return { skipped: true, reason: "no_linked_user" };
  return syncWalletPassesForUserId(row.user_id);
}

/** Fire-and-forget after Stripe changes membership rows. */
export function queueWalletSyncForStripeEvent(event) {
  const type = event?.type;
  const obj = event?.data?.object;
  if (!obj || !isGoogleWalletEnabled()) return;

  let customerId = null;
  if (typeof obj.customer === "string") customerId = obj.customer;
  else if (type?.startsWith("customer.subscription.")) customerId = obj.customer;
  else if (type === "checkout.session.completed" && typeof obj.customer === "string") {
    customerId = obj.customer;
  }

  if (!customerId) return;

  syncWalletPassesForStripeCustomer(customerId).catch((err) => {
    console.warn("[wallet-sync] Stripe event wallet refresh failed:", err.message || err);
  });
}
