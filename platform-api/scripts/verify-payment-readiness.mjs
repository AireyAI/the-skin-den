#!/usr/bin/env node
/**
 * Pre-launch smoke for membership/class payments (no secrets printed).
 *
 *   node scripts/verify-payment-readiness.mjs
 *   PLATFORM_API=https://platform-api-production-8a3b.up.railway.app node scripts/verify-payment-readiness.mjs
 */
const base = (process.env.PLATFORM_API || "https://platform-api-production-8a3b.up.railway.app").replace(
  /\/$/,
  ""
);

const checks = [];

async function get(path) {
  const res = await fetch(`${base}${path}`);
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: res.status, json, text };
}

async function main() {
  const health = await get("/health");
  checks.push({
    name: "API health",
    ok: health.status === 200,
    detail: health.status === 200 ? "ok" : health.text.slice(0, 120)
  });

  const products = await get("/v1/public/products");
  const list = products.json?.products || [];
  checks.push({
    name: "Public products",
    ok: products.status === 200 && list.length >= 2,
    detail: list.map((p) => `${p.id} ${p.priceLabel}`).join(", ") || products.text.slice(0, 80)
  });

  const sub = list.find((p) => p.type === "subscription");
  if (sub?.pricePence) {
    const fee = Math.floor((sub.pricePence * 500) / 10000);
    const net = sub.pricePence - fee;
    checks.push({
      name: "5% split math (example membership)",
      ok: true,
      detail: `£${(sub.pricePence / 100).toFixed(2)} → platform £${(fee / 100).toFixed(2)}, studio £${(net / 100).toFixed(2)} before Stripe card fees`
    });
  }

  const schedule = await get("/v1/public/schedule");
  checks.push({
    name: "Public schedule",
    ok: schedule.status === 200,
    detail: schedule.status === 200 ? "ok" : schedule.text.slice(0, 80)
  });

  console.log(`Platform API: ${base}\n`);
  let fail = 0;
  for (const c of checks) {
    const mark = c.ok ? "PASS" : "FAIL";
    if (!c.ok) fail += 1;
    console.log(`${mark}  ${c.name}`);
    console.log(`      ${c.detail}\n`);
  }

  console.log("Blocking before live money:");
  console.log("  • Jack: admin → Set up payouts until banner clears (Connect charges + transfers).");
  console.log("  • Railway: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, PLATFORM_FEE_BPS=500, latest deploy.");
  console.log("  • Stripe platform display name → Clockwork Booking (fee label for coaches).");
  console.log("  • Test: pricing → Join membership → pay (test card in test mode only).");

  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
