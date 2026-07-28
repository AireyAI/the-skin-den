import { config } from "./config.mjs";
import {
  getStripeConnectAccountId,
  clearStripeConnectAccountId,
  isStaleConnectAccountError
} from "./tenant-settings.mjs";
import { getStripe, stripeSecretKeyProblem } from "./stripe-client.mjs";

// Every public checkout blocks on this lookup. The answer changes roughly never once
// onboarding is done, so a short cache keeps a Stripe API blip from taking the shop
// offline and keeps a page load from paying for a round trip.
let cache = { at: 0, value: null };

export function clearConnectStatusCache() {
  cache = { at: 0, value: null };
}

export async function getConnectStatus({ fresh = false } = {}) {
  if (!fresh && cache.value && Date.now() - cache.at < config.connectStatusCacheMs) {
    return cache.value;
  }
  const status = await loadConnectStatus();
  if (status.readyForCheckout && !status.lookupFailed) {
    cache = { at: Date.now(), value: status };
  } else if (status.configured === false) {
    cache = { at: Date.now(), value: status };
  }
  return status;
}

async function loadConnectStatus() {
  const keyProblem = stripeSecretKeyProblem();
  if (keyProblem) {
    return {
      configured: false,
      connectAccountId: getStripeConnectAccountId() || null,
      payoutsEnabled: false,
      chargesEnabled: false,
      detailsSubmitted: false,
      readyForCheckout: false,
      blockedReason: "stripe_secret_key",
      message: keyProblem
    };
  }
  const stripe = getStripe();
  if (!stripe) {
    return {
      configured: false,
      connectAccountId: null,
      payoutsEnabled: false,
      chargesEnabled: false,
      detailsSubmitted: false,
      readyForCheckout: false,
      blockedReason: "stripe_not_configured",
      message: "Stripe secret key not set on server."
    };
  }
  if (!getStripeConnectAccountId()) {
    return {
      configured: true,
      connectAccountId: null,
      payoutsEnabled: false,
      chargesEnabled: false,
      detailsSubmitted: false,
      message: "Connect account not linked — use admin to start onboarding."
    };
  }
  try {
    const acct = await stripe.accounts.retrieve(getStripeConnectAccountId());
    const transfers = acct.capabilities?.transfers;
    return {
      configured: true,
      connectAccountId: acct.id,
      payoutsEnabled: !!acct.payouts_enabled,
      chargesEnabled: !!acct.charges_enabled,
      detailsSubmitted: !!acct.details_submitted,
      transfersCapability: transfers || "inactive",
      tenant: acct.metadata?.tenant || null,
      readyForCheckout:
        !!acct.charges_enabled &&
        (transfers === "active" || acct.capabilities?.legacy_payments === "active"),
      blockedReason:
        !!acct.charges_enabled &&
        (transfers === "active" || acct.capabilities?.legacy_payments === "active")
          ? null
          : "connect_onboarding",
      message: acct.details_submitted
        ? acct.charges_enabled
          ? "Stripe Connect onboarding complete."
          : "Stripe is reviewing the studio account — try again shortly."
        : "Finish Stripe Express onboarding (bank + ID) in admin → Set up payouts."
    };
  } catch (e) {
    const msg = e.message || "Could not load Connect account.";
    const restricted =
      config.stripeSecretKey.startsWith("rk_") && isStaleConnectAccountError(msg);
    if (!restricted && isStaleConnectAccountError(msg)) {
      clearStripeConnectAccountId();
      const retryId = getStripeConnectAccountId();
      if (retryId) {
        try {
          const acct = await stripe.accounts.retrieve(retryId);
          const transfers = acct.capabilities?.transfers;
          return {
            configured: true,
            connectAccountId: acct.id,
            payoutsEnabled: !!acct.payouts_enabled,
            chargesEnabled: !!acct.charges_enabled,
            detailsSubmitted: !!acct.details_submitted,
            transfersCapability: transfers || "inactive",
            tenant: acct.metadata?.tenant || null,
            readyForCheckout:
              !!acct.charges_enabled &&
              (transfers === "active" || acct.capabilities?.legacy_payments === "active"),
            blockedReason:
              !!acct.charges_enabled &&
              (transfers === "active" || acct.capabilities?.legacy_payments === "active")
                ? null
                : "connect_onboarding",
            message: acct.details_submitted
              ? acct.charges_enabled
                ? "Stripe Connect onboarding complete."
                : "Stripe is reviewing the studio account — try again shortly."
              : "Finish Stripe Express onboarding (bank + ID) in admin → Set up payouts."
          };
        } catch {
          /* fall through */
        }
      }
      return {
        configured: true,
        connectAccountId: retryId || null,
        payoutsEnabled: false,
        chargesEnabled: false,
        detailsSubmitted: false,
        readyForCheckout: false,
        blockedReason: "connect_onboarding",
        message: "Finish Stripe Express onboarding (bank + ID) in admin → Set up payouts."
      };
    }
    return {
      configured: true,
      connectAccountId: getStripeConnectAccountId(),
      payoutsEnabled: false,
      chargesEnabled: false,
      detailsSubmitted: false,
      readyForCheckout: false,
      lookupFailed: true,
      blockedReason: restricted ? "stripe_restricted_key" : "connect_lookup_failed",
      message: restricted
        ? "Server Stripe key is restricted (rk_live). Replace STRIPE_SECRET_KEY on Railway with the platform secret key (sk_live_…) so Connect and payouts work."
        : msg
    };
  }
}
