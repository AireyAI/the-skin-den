#!/usr/bin/env node
/**
 * One-time: reuse AireyAI platform Stripe key (same as clockwork / Skin Den),
 * register Railway webhook, create Kettle Kulture Connect Express account.
 * Does not print secret values.
 */
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import Stripe from "stripe";

const WEBHOOK_URL =
  process.env.KK_STRIPE_WEBHOOK_URL ||
  "https://platform-api-production-8a3b.up.railway.app/v1/stripe/webhook";

const WEBHOOK_EVENTS = [
  "checkout.session.completed",
  "invoice.paid",
  "invoice.payment_failed",
  "invoice.payment_succeeded",
  "customer.subscription.updated",
  "customer.subscription.deleted"
];

function loadStripeSecret() {
  if (process.env.STRIPE_SECRET_KEY?.startsWith("sk_")) {
    return process.env.STRIPE_SECRET_KEY;
  }
  const cw = join(homedir(), "AireyAi_projects/clockwork-bookings/.env");
  if (existsSync(cw)) {
    for (const line of readFileSync(cw, "utf8").split("\n")) {
      if (line.startsWith("STRIPE_SECRET_KEY=sk_")) {
        return line.slice("STRIPE_SECRET_KEY=".length).trim();
      }
    }
  }
  const mcp = join(homedir(), ".config/cursor-mcp/secrets.env");
  if (existsSync(mcp)) {
    for (const line of readFileSync(mcp, "utf8").split("\n")) {
      const m = line.match(/^export\s+STRIPE_API_KEY="(sk_[^"]+)"/);
      if (m) return m[1];
      const m2 = line.match(/^STRIPE_API_KEY=(sk_.+)$/);
      if (m2) return m2[1].replace(/^["']|["']$/g, "");
    }
  }
  if (process.env.STRIPE_SECRET_KEY?.startsWith("rk_")) {
    return process.env.STRIPE_SECRET_KEY;
  }
  const mcp2 = join(homedir(), ".config/cursor-mcp/secrets.env");
  if (existsSync(mcp2)) {
    for (const line of readFileSync(mcp2, "utf8").split("\n")) {
      const m = line.match(/^export\s+STRIPE_API_KEY="(rk_[^"]+)"/);
      if (m) return m[1];
    }
  }
  throw new Error(
    "No STRIPE_SECRET_KEY — set sk_live_… on Railway or in clockwork-bookings/.env"
  );
}

async function ensureWebhook(stripe) {
  const listed = await stripe.webhookEndpoints.list({ limit: 100 });
  const existing = listed.data.find((w) => w.url === WEBHOOK_URL);
  if (existing) {
    await stripe.webhookEndpoints.update(existing.id, {
      enabled_events: WEBHOOK_EVENTS,
      disabled: false
    });
    return { id: existing.id, secret: null, reused: true };
  }
  const created = await stripe.webhookEndpoints.create({
    url: WEBHOOK_URL,
    enabled_events: WEBHOOK_EVENTS,
    description: "Kettle Kulture platform-api (class booking + membership hooks)"
  });
  return { id: created.id, secret: created.secret, reused: false };
}

async function ensureConnectAccount(stripe, email) {
  const tenant = process.env.KK_TENANT_SLUG || "kettle-kulture";
  const listed = await stripe.accounts.list({ limit: 100 });
  const match = listed.data.find(
    (a) => a.metadata?.tenant === tenant || a.email === email
  );
  if (match) return match.id;
  const account = await stripe.accounts.create({
    type: "express",
    country: "GB",
    email,
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true }
    },
    business_type: "individual",
    metadata: { tenant }
  });
  return account.id;
}

async function main() {
  const secret = loadStripeSecret();
  const mode = secret.includes("_live_") ? "live" : "test";
  const stripe = new Stripe(secret);
  const coachEmail = process.env.KK_COACH_EMAIL || "kettle.kulture@outlook.com";

  const account = await stripe.accounts.retrieve();
  console.log(`Platform Stripe account: ${account.id} (${mode} key)`);

  const connectId = await ensureConnectAccount(stripe, coachEmail);
  console.log(`Connect account for gym: ${connectId}`);

  const wh = await ensureWebhook(stripe);
  if (wh.reused && !wh.secret) {
    console.log(
      `Webhook endpoint already exists (${wh.id}). If STRIPE_WEBHOOK_SECRET is missing on Railway, create a new endpoint in Dashboard or delete ${wh.id} and re-run.`
    );
  } else {
    console.log(`Webhook endpoint created: ${wh.id}`);
  }

  const outPath = join(process.cwd(), ".stripe-provision.local");
  const lines = [
    `# generated ${new Date().toISOString()} — chmod 600, do not commit`,
    `STRIPE_SECRET_KEY=${secret}`,
    `STRIPE_CONNECT_ACCOUNT_ID=${connectId}`,
    `PLATFORM_FEE_BPS=500`,
    `KK_PUBLIC_SITE_ORIGIN=https://kettlekulture.co.uk`,
    `KK_CORS_ORIGINS=https://kettlekulture.co.uk,https://www.kettlekulture.co.uk,https://kettle-kulture.vercel.app,http://localhost:3000`
  ];
  if (wh.secret) {
    lines.push(`STRIPE_WEBHOOK_SECRET=${wh.secret}`);
  }
  writeFileSync(outPath, `${lines.join("\n")}\n`, { mode: 0o600 });
  console.log(`Wrote ${outPath} (secrets not printed).`);
  console.log(
    "Next: node scripts/push-stripe-to-railway.mjs  (or paste vars from that file into Railway dashboard)"
  );
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
