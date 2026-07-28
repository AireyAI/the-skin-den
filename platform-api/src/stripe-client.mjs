import Stripe from "stripe";
import { config } from "./config.mjs";
import { getStripeConnectAccountId } from "./tenant-settings.mjs";

let stripe;

export function getStripe() {
  const key = config.stripeSecretKey;
  if (!key) return null;
  if (!key.startsWith("sk_") && !key.startsWith("rk_")) return null;
  if (!stripe) stripe = new Stripe(key);
  return stripe;
}

/** @returns {string|null} Hard block reason, or null if Stripe can run Checkout (sk_ or rk_). */
export function stripeSecretKeyProblem() {
  if (!config.stripeSecretKey) return "STRIPE_SECRET_KEY is not set on the server.";
  if (!config.stripeSecretKey.startsWith("sk_") && !config.stripeSecretKey.startsWith("rk_")) {
    return "STRIPE_SECRET_KEY does not look like a Stripe secret or restricted key.";
  }
  return null;
}

export async function useConnectDirectCharges() {
  const connectId = getStripeConnectAccountId();
  if (!connectId) return false;
  const { getConnectStatus } = await import("./stripe-status.mjs");
  const status = await getConnectStatus();
  return !!status.readyForCheckout;
}

/**
 * The studio's own Connect account, or no charge at all.
 *
 * There is deliberately no platform-account fallback: taking a customer's money
 * onto the platform account when payouts are not connected leaves the studio's
 * revenue in the wrong Stripe balance, which is worse than a refused sale.
 */
async function requireConnectDestination(context) {
  const connectId = getStripeConnectAccountId();
  const { getConnectStatus } = await import("./stripe-status.mjs");
  const status = await getConnectStatus();

  if (!connectId || !status.readyForCheckout) {
    throw new Error(
      `Payouts are not connected yet, so this ${context} payment was refused instead of taken on the platform account. Finish admin -> Set up payouts. (${status.blockedReason || "not_ready"})`
    );
  }

  // Guards the clone-per-tenant deployment model: a Connect account id copied
  // from another studio's environment would otherwise receive this studio's money.
  if (status.tenant && status.tenant !== config.tenantSlug) {
    throw new Error(
      `Connect account ${connectId} is registered to tenant "${status.tenant}", not "${config.tenantSlug}" - refusing to take payment. Check STRIPE_CONNECT_ACCOUNT_ID.`
    );
  }

  return connectId;
}

/** Booking service fee in pence (default 5%) — retained on the platform Stripe account. */
export function platformFeePence(amountPence) {
  const bps = config.platformFeeBps;
  return Math.floor((amountPence * bps) / 10000);
}

/** Direct charges on the studio Connect account — members see Kettle Kulture on card/bank statements. */
function connectCheckoutOpts() {
  const acct = getStripeConnectAccountId();
  return acct ? { stripeAccount: acct } : undefined;
}

export async function createClassCheckoutSession(opts) {
  const { amountPence, productName, ...rest } = opts;
  return createClassesCheckoutSession({
    ...rest,
    lineItems: [{ amountPence, productName }]
  });
}

/** One Stripe Checkout for one or more class drop-ins (Apple Pay + card on Stripe’s page). */
export async function createClassesCheckoutSession({
  lineItems,
  customerEmail,
  metadata,
  successUrl,
  cancelUrl
}) {
  const s = getStripe();
  if (!s) throw new Error("Stripe is not configured on the server.");
  if (!lineItems?.length) throw new Error("At least one class is required.");

  const totalPence = lineItems.reduce((n, li) => n + (li.amountPence || 0), 0);
  const fee = platformFeePence(totalPence);
  const sessionParams = {
    mode: "payment",
    customer_email: customerEmail,
    payment_method_types: ["card"],
    line_items: lineItems.map((li) => ({
      quantity: 1,
      price_data: {
        currency: "gbp",
        unit_amount: li.amountPence,
        product_data: { name: li.productName }
      }
    })),
    metadata: {
      ...metadata,
      checkout_route: "pending"
    },
    success_url: successUrl,
    cancel_url: cancelUrl
  };

  const connectId = await requireConnectDestination("class");
  sessionParams.payment_intent_data = { application_fee_amount: fee };
  sessionParams.metadata.checkout_route = "connect";
  return s.checkout.sessions.create(sessionParams, { stripeAccount: connectId });
}

export async function createProductCheckoutSession({
  mode,
  productName,
  amountPence,
  customerEmail,
  metadata,
  successUrl,
  cancelUrl,
  recurringInterval
}) {
  const s = getStripe();
  if (!s) throw new Error("Stripe is not configured on the server.");

  const lineItem =
    mode === "subscription"
      ? {
          quantity: 1,
          price_data: {
            currency: "gbp",
            unit_amount: amountPence,
            product_data: { name: productName },
            recurring: { interval: recurringInterval || "month" }
          }
        }
      : {
          quantity: 1,
          price_data: {
            currency: "gbp",
            unit_amount: amountPence,
            product_data: { name: productName }
          }
        };

  const sessionParams = {
    mode,
    customer_email: customerEmail,
    line_items: [lineItem],
    metadata,
    success_url: successUrl,
    cancel_url: cancelUrl
  };

  const feePercent = config.platformFeeBps / 100;
  const connectId = await requireConnectDestination(
    mode === "subscription" ? "membership" : "pack"
  );

  if (mode === "subscription") {
    sessionParams.subscription_data = {
      application_fee_percent: feePercent,
      metadata
    };
  } else {
    const fee = platformFeePence(amountPence);
    sessionParams.payment_intent_data = { application_fee_amount: fee };
  }
  return s.checkout.sessions.create(sessionParams, { stripeAccount: connectId });
}


export async function ensureConnectBillingPortal(accountId) {
  const s = getStripe();
  if (!s || !accountId) return;
  const listed = await s.billingPortal.configurations.list({ limit: 1 }, { stripeAccount: accountId });
  if (listed.data.length) return;
  await s.billingPortal.configurations.create(
    {
      features: {
        payment_method_update: { enabled: true },
        invoice_history: { enabled: true },
        subscription_cancel: { enabled: true }
      }
    },
    { stripeAccount: accountId }
  );
}

export async function createBillingPortalSession({ customerId, returnUrl }) {
  const s = getStripe();
  if (!s) throw new Error("Stripe is not configured.");
  if (!customerId) throw new Error("No billing profile linked yet.");
  return s.billingPortal.sessions.create(
    { customer: customerId, return_url: returnUrl },
    connectCheckoutOpts()
  );
}

export async function createConnectAccountLink(
  accountId,
  refreshUrl,
  returnUrl,
  { type = "account_onboarding" } = {}
) {
  const s = getStripe();
  if (!s) throw new Error("Stripe is not configured on the server.");
  try {
    return await s.accountLinks.create({
      account: accountId,
      refresh_url: refreshUrl,
      return_url: returnUrl,
      type
    });
  } catch (e) {
    if (type === "account_update") {
      return s.accountLinks.create({
        account: accountId,
        refresh_url: refreshUrl,
        return_url: returnUrl,
        type: "account_onboarding"
      });
    }
    throw e;
  }
}

/** Express Dashboard — bank, payouts, verification (when Connect is already live). */
export async function createExpressDashboardLink(accountId) {
  const s = getStripe();
  if (!s) throw new Error("Stripe is not configured on the server.");
  return s.accounts.createLoginLink(accountId);
}

export function connectAccountLive(acct) {
  if (!acct) return false;
  const transfers = acct.capabilities?.transfers;
  return (
    !!acct.charges_enabled &&
    (transfers === "active" || acct.capabilities?.legacy_payments === "active")
  );
}

export async function createExpressConnectAccount(email) {
  const s = getStripe();
  if (!s) throw new Error("Stripe is not configured.");
  return s.accounts.create({
    type: "express",
    country: "GB",
    email,
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true }
    },
    business_type: "individual",
    business_profile: {
      name: config.studioName,
      product_description: config.studioDescription
    },
    metadata: { tenant: config.tenantSlug }
  });
}
