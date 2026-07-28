import { authMiddleware, getMemberProfile } from "./auth-routes.mjs";
import { isGoogleWalletEnabled, googleWalletSaveUrl } from "./google-wallet.mjs";

export async function getMemberGoogleWallet(req) {
  const auth = authMiddleware("member")(req);
  if (auth.error) return { status: auth.status, json: { error: auth.error } };

  if (!isGoogleWalletEnabled()) {
    return {
      status: 503,
      json: {
        enabled: false,
        error: "Google Wallet is not configured on the server yet."
      }
    };
  }

  const profile = getMemberProfile(req);
  if (profile.status !== 200) return profile;

  try {
    const saveUrl = await googleWalletSaveUrl({
      user: profile.json.user,
      membership: profile.json.membership
    });
    return {
      status: 200,
      json: { enabled: true, saveUrl, provider: "google" }
    };
  } catch (e) {
    console.error("[google-wallet] save URL failed:", e.message || e);
    return {
      status: 502,
      json: { enabled: false, error: e.message || "Could not build Google Wallet pass" }
    };
  }
}
