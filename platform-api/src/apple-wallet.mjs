import { authMiddleware, getMemberProfile } from "./auth-routes.mjs";
import { isAppleWalletEnabled, buildApplePkPass } from "./apple-wallet-pass.mjs";
import { parseBearer, verifyJwt, issuePassDownloadToken } from "./auth-crypto.mjs";
import { config } from "./config.mjs";

function passDownloadTokenFromReq(req) {
  let token = parseBearer(req);
  if (!token) {
    try {
      token = new URL(req.url, "http://localhost").searchParams.get("download");
    } catch {
      token = null;
    }
  }
  return token;
}

function reqWithMemberBearer(req, token) {
  return {
    ...req,
    headers: Object.assign({}, req.headers || {}, { authorization: `Bearer ${token}` })
  };
}

export function getMemberAppleWalletLink(req) {
  const auth = authMiddleware("member")(req);
  if (auth.error) return { status: auth.status, json: { error: auth.error } };

  if (!isAppleWalletEnabled()) {
    return {
      status: 503,
      json: {
        enabled: false,
        error:
          "Apple Wallet is not configured yet. Studio is adding Pass Type ID certificates (see docs/APPLE-WALLET-SETUP.md)."
      }
    };
  }

  const download = issuePassDownloadToken(auth.payload.sub, config.jwtSecret, 300);
  const site = config.publicSiteOrigin.replace(/\/$/, "");
  const url = `${site}/api/member-apple-pass?download=${encodeURIComponent(download)}`;
  const apiOrigin = (process.env.RAILWAY_PUBLIC_DOMAIN
    ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
    : "https://platform-api-production-8a3b.up.railway.app"
  ).replace(/\/$/, "");
  const directUrl = `${apiOrigin}/v1/member/wallet/apple?download=${encodeURIComponent(download)}`;

  return {
    status: 200,
    json: { enabled: true, url, directUrl, expiresInSec: 300 }
  };
}

export async function getMemberAppleWallet(req) {
  const token = passDownloadTokenFromReq(req);
  if (!token) return { status: 401, json: { error: "Unauthorized" } };
  const payload = verifyJwt(token, config.jwtSecret);
  if (!payload?.sub || payload.role !== "member") {
    return { status: 401, json: { error: "Invalid session" } };
  }

  if (!isAppleWalletEnabled()) {
    return {
      status: 503,
      json: {
        enabled: false,
        error:
          "Apple Wallet is not configured yet. Add Pass Type ID + certificates on Railway (see docs/APPLE-WALLET-SETUP.md)."
      }
    };
  }

  const profile = getMemberProfile(reqWithMemberBearer(req, token));
  if (profile.status !== 200) return profile;

  try {
    const buffer = await buildApplePkPass({
      user: profile.json.user,
      membership: profile.json.membership
    });
    return { status: 200, buffer };
  } catch (e) {
    return {
      status: 502,
      json: { enabled: false, error: e.message || "Could not build Apple Wallet pass" }
    };
  }
}
