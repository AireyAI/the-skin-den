import { randomUUID } from "node:crypto";
import { config } from "./config.mjs";
import { getProduct, listPublishedProducts } from "./products.mjs";
import { createProductCheckoutSession } from "./stripe-client.mjs";
import { authMiddleware } from "./auth-routes.mjs";
import { getDb, membershipForUser } from "./db.mjs";
import { getConnectStatus } from "./stripe-status.mjs";
import { createBillingPortalSession } from "./stripe-client.mjs";
import { hit, clientKey } from "./rate-limit.mjs";

export function getPublicProductsHandler() {
  return {
    status: 200,
    json: { products: listPublishedProducts() }
  };
}

export async function postProductCheckout(body, req) {
  const gate = hit(`product-checkout:${clientKey(req)}`, { limit: 12, windowMs: 15 * 60 * 1000 });
  if (!gate.allowed) {
    return { status: 429, json: { error: "Too many checkout attempts.", retryAfterSec: gate.retryAfterSec } };
  }
  const productId = body.productId;
  let email = (body.email || "").trim().toLowerCase();
  let name = (body.name || "").trim();
  const authMember = authMiddleware("member")(req);
  if (!authMember.error) {
    const database = getDb();
    const user = database.prepare("SELECT id, email, name FROM users WHERE id = ?").get(authMember.payload.sub);
    if (user?.email) {
      email = user.email.trim().toLowerCase();
      name = (user.name || name || user.email).trim();
    }
  }
  if (!productId || !email) {
    return { status: 400, json: { error: "productId and email are required" } };
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { status: 400, json: { error: "That email address does not look right." } };
  }

  const product = getProduct(productId);
  if (!product) return { status: 404, json: { error: "Product not found" } };

  const status = await getConnectStatus();
  const { getStripe, stripeSecretKeyProblem } = await import("./stripe-client.mjs");
  if (stripeSecretKeyProblem() || !getStripe()) {
    return {
      status: 503,
      json: { error: stripeSecretKeyProblem() || "Stripe is not configured on the server." }
    };
  }
  if (!status.readyForCheckout && product.type === "subscription") {
    return {
      status: 503,
      json: {
        error:
          "Membership subscriptions open after Stripe Connect onboarding is complete (admin → Set up payouts)."
      }
    };
  }
  if (!status.readyForCheckout) {
    console.warn("[platform-api] product checkout: platform fallback until Connect is live");
  }

  const origin = config.publicSiteOrigin.replace(/\/$/, "");
  const purchaseId = `pur_${randomUUID().slice(0, 12)}`;
  const mode = product.type === "subscription" ? "subscription" : "payment";

  // Only a signed-in member's *own* membership may be targeted. body.memberId used to
  // be trusted straight from an unauthenticated request, which let anyone apply a
  // purchase to someone else's row — and overwrite that row's email in the process.
  let memberId = null;
  const token = req?.headers?.authorization?.replace(/^Bearer\s+/i, "");
  if (token) {
    try {
      const auth = authMiddleware("member")(req);
      if (!auth.error) {
        const database = getDb();
        const user = database.prepare("SELECT id, email FROM users WHERE id = ?").get(auth.payload.sub);
        if (user) {
          const membership = membershipForUser(database, user.id);
          memberId = membership?.id || null;
        }
      }
    } catch {
      /* optional auth */
    }
  }

  const metadata = {
    purchase_id: purchaseId,
    product_id: product.id,
    plan_type: product.type,
    pack_credits: product.packCredits != null ? String(product.packCredits) : "",
    pack_validity_days: product.packValidityDays != null ? String(product.packValidityDays) : "",
    customer_name: (name || email.split("@")[0]).slice(0, 80),
    customer_email: email,
    tenant: config.tenantSlug,
    member_id: memberId || ""
  };

  const session = await createProductCheckoutSession({
    mode,
    productName: product.name,
    amountPence: product.pricePence,
    customerEmail: email,
    metadata,
    // The session id is the buyer's proof of purchase — /v1/auth/member/claim checks
    // it against Stripe to link the membership without an email round-trip.
    successUrl: `${origin}/account/?purchased=1&session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${origin}/pricing.html?cancelled=1`,
    recurringInterval: "month"
  });

  return { status: 200, json: { checkoutUrl: session.url, purchaseId } };
}

export function getMemberBilling(req) {
  const auth = authMiddleware("member")(req);
  if (auth.error) return { status: auth.status, json: { error: auth.error } };
  const database = getDb();
  const user = database.prepare("SELECT id, email FROM users WHERE id = ?").get(auth.payload.sub);
  if (!user) return { status: 404, json: { error: "User not found" } };
  const membership = membershipForUser(database, user.id);
  const m = membership || {};
  const paymentFailed = m.lastPaymentStatus === "failed" || m.status === "payment_failed";

  return {
    status: 200,
    json: {
      hasMembership: Boolean(membership),
      stripeCustomerId: m.stripeCustomerId || null,
      portalAvailable: Boolean(m.stripeCustomerId && config.stripeSecretKey),
      paymentFailed,
      lastPaymentAt: m.lastPaymentAt || null,
      plan: m.plan || null,
      planType: m.planType || null,
      renewalDate: m.renewalDate || null,
      autoRenew: !!m.autoRenew,
      packCredits: m.packCredits ?? null,
      packExpiresAt: m.packExpiresAt || null,
      message: paymentFailed
        ? "Your last membership payment did not go through. Update your card to stay on the timetable."
        : m.stripeCustomerId
          ? "View invoices and update your payment method securely."
          : "After your first online purchase, billing self-service will appear here."
    }
  };
}

export async function postMemberBillingPortal(req) {
  const auth = authMiddleware("member")(req);
  if (auth.error) return { status: auth.status, json: { error: auth.error } };
  const database = getDb();
  const membership = membershipForUser(database, auth.payload.sub);
  const customerId = membership?.stripeCustomerId;
  if (!customerId) {
    return { status: 400, json: { error: "No billing profile yet — buy a pack or membership first." } };
  }
  const origin = config.publicSiteOrigin.replace(/\/$/, "");
  const session = await createBillingPortalSession({
    customerId,
    returnUrl: `${origin}/account/?billing=1`
  });
  return { status: 200, json: { url: session.url } };
}
