import { createHmac, timingSafeEqual } from "node:crypto";
import { applyStripeEvent } from "./stripe-events.mjs";
import { queueWalletSyncForStripeEvent } from "./wallet-sync.mjs";

/** Stripe webhook — verify signature when STRIPE_WEBHOOK_SECRET is set. */
export function handleStripeWebhook(req, rawBody) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const sig = req.headers["stripe-signature"];
  if (!secret) {
    return { status: 503, json: { error: "Stripe webhooks not configured" } };
  }
  if (!sig || !verifyStripeSignature(rawBody, sig, secret)) {
    return { status: 400, json: { error: "Invalid signature" } };
  }
  let event;
  try {
    event = JSON.parse(rawBody.toString("utf8"));
  } catch {
    return { status: 400, json: { error: "Invalid payload" } };
  }

  const result = applyStripeEvent(event);
  queueWalletSyncForStripeEvent(event);
  return { status: 200, json: { received: true, type: event.type, ...result } };
}

function verifyStripeSignature(payload, header, secret) {
  // Stripe sends every applicable v1 signature, and during a secret rotation there
  // is more than one. Keeping only the last (Object.fromEntries) meant a rotation
  // silently rejected live events, so collect them all and accept any match.
  let ts = null;
  const signatures = [];
  for (const part of header.split(",")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const k = part.slice(0, eq).trim();
    const v = part.slice(eq + 1).trim();
    if (k === "t") ts = v;
    else if (k === "v1") signatures.push(v);
  }
  if (!ts || !signatures.length) return false;
  const ageSec = Math.abs(Date.now() / 1000 - Number(ts));
  if (!Number.isFinite(ageSec) || ageSec > 300) return false;

  const signed = `${ts}.${payload.toString("utf8")}`;
  const expected = Buffer.from(createHmac("sha256", secret).update(signed).digest("hex"), "hex");
  return signatures.some((sig) => {
    try {
      const given = Buffer.from(sig, "hex");
      return given.length === expected.length && timingSafeEqual(given, expected);
    } catch {
      return false;
    }
  });
}
