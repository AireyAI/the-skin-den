import { config } from "./config.mjs";
import { isGoogleWalletEnabled } from "./google-wallet.mjs";
import { isAppleWalletEnabled } from "./apple-wallet-pass.mjs";

export function getPublicConfig() {
  return {
    appleClientId: config.appleClientId || null,
    appleSignInEnabled: Boolean(config.appleClientId) || config.allowDevAuth,
    googleClientId: config.googleClientId || null,
    googleSignInEnabled: Boolean(config.googleClientId) || config.allowDevAuth,
    googleWalletEnabled: isGoogleWalletEnabled(),
    appleWalletEnabled: isAppleWalletEnabled(),
    memberJoinUrl: `${config.publicSiteOrigin.replace(/\/$/, "")}/join/`
  };
}
