#!/usr/bin/env node
/**
 * Set platform display name → Express shows "{name} application fee" on the 5%.
 * Needs a live secret key with permission to update the platform account (not Connect-only restricted keys).
 */
import Stripe from "stripe";

const name = process.argv[2]?.trim() || "Clockwork Booking";
const key = process.env.STRIPE_SECRET_KEY;

if (!key?.startsWith("sk_live_")) {
  console.error("Set STRIPE_SECRET_KEY=sk_live_... (full platform secret, not restricted).");
  process.exit(1);
}

const stripe = new Stripe(key);
const before = await stripe.accounts.retrieve();
console.log("Before:", before.settings?.dashboard?.display_name || "(none)");

try {
  const updated = await stripe.rawRequest("POST", "/v1/account", {
    body: new URLSearchParams({
      "settings[dashboard][display_name]": name,
      "business_profile[name]": name,
    }).toString(),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });
  console.log("After:", updated.settings?.dashboard?.display_name);
  console.log("Future fee line:", `${name} application fee`);
} catch (e) {
  if (e.statusCode === 403 || e.message?.includes("your own account")) {
    console.error(
      "This API key cannot rename the platform account (restricted key).\n" +
        "Do it once in Stripe Dashboard:\n" +
        "  https://dashboard.stripe.com/settings/public\n" +
        `  Set business / display name to "${name}" and save.\n` +
        "New payments will then show Clockwork on Jack's fee line, not AireyAI."
    );
    process.exit(1);
  }
  throw e;
}
