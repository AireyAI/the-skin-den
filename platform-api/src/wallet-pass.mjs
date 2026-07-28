import { config } from "./config.mjs";
import { mintCheckinToken, checkinQrUrl } from "./checkin-token.mjs";

/** Stable id for Google object / Apple serial (member row or signed-in user). */
export function walletPassObjectKey(user, membership) {
  if (membership?.id) return membership.id;
  const safe = String(user.id).replace(/[^a-zA-Z0-9._-]/g, "_");
  return `u_${safe}`;
}

/** Door check-in QR when a plan is linked; otherwise account link to choose a plan. */
export function walletBarcodeForPass({ user, membership }) {
  if (membership?.id) {
    const token = mintCheckinToken({
      memberId: membership.id,
      userId: user.id,
      ttlSec: config.walletTokenTtlSec
    });
    return checkinQrUrl(token);
  }
  const origin = config.publicSiteOrigin.replace(/\/$/, "");
  return `${origin}/account/?wallet=1`;
}

export function walletLoyaltyPoints(membership) {
  if (!membership?.id) {
    return { label: "Status", balance: { string: "Add a plan" } };
  }
  if (membership.planType === "unlimited" || membership.status === "active") {
    if (membership.packCredits == null && membership.planType === "unlimited") {
      return { label: "Plan", balance: { string: "Unlimited" } };
    }
  }
  if (membership.packCredits != null) {
    return { label: "Classes left", balance: { int: Math.max(0, membership.packCredits) } };
  }
  return { label: "Plan", balance: { string: membership.plan || "Member" } };
}

export function walletRenewalModuleBody(membership) {
  if (!membership?.id) return "Choose a plan at kettlekulture.co.uk";
  return membership.renewalDate || "—";
}
