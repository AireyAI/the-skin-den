#!/usr/bin/env node
/**
 * Fix Connect account email on Stripe (e.g. old placeholder coach@kettlekulture.co.uk).
 * Does not print secrets.
 *
 *   KK_COACH_EMAIL=kettle.kulture@outlook.com \
 *   STRIPE_CONNECT_ACCOUNT_ID=acct_... \
 *   node scripts/fix-connect-account-email.mjs
 */
import Stripe from "stripe";
import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

function loadStripeSecret() {
  if (process.env.STRIPE_SECRET_KEY?.startsWith("sk_")) return process.env.STRIPE_SECRET_KEY;
  const mcp = join(homedir(), ".config/cursor-mcp/secrets.env");
  if (existsSync(mcp)) {
    for (const line of readFileSync(mcp, "utf8").split("\n")) {
      const m = line.match(/^export\s+STRIPE_API_KEY="(.+)"/);
      if (m) return m[1];
    }
  }
  throw new Error("Set STRIPE_SECRET_KEY");
}

const email = (process.env.KK_COACH_EMAIL || "kettle.kulture@outlook.com").toLowerCase();
const accountId = process.env.STRIPE_CONNECT_ACCOUNT_ID?.trim();

async function main() {
  const stripe = new Stripe(loadStripeSecret());
  let acctId = accountId;
  if (!acctId) {
    const tenant = process.env.KK_TENANT_SLUG || "kettle-kulture";
    const listed = await stripe.accounts.list({ limit: 100 });
    const match = listed.data.find((a) => a.metadata?.tenant === tenant);
    if (!match) throw new Error("No Connect account — set STRIPE_CONNECT_ACCOUNT_ID");
    acctId = match.id;
  }
  const before = await stripe.accounts.retrieve(acctId);
  console.log(`Account ${acctId}`);
  console.log(`  email before: ${before.email || "(none)"}`);
  const updated = await stripe.accounts.update(acctId, { email });
  console.log(`  email after:  ${updated.email}`);
  console.log("Done — Stripe notifications for this account will use the new address.");
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
