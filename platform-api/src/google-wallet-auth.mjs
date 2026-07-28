import { GoogleAuth, Impersonated } from "google-auth-library";
import { config } from "./config.mjs";

const WALLET_SCOPE = "https://www.googleapis.com/auth/wallet_object.issuer";
const CLOUD_SCOPE = "https://www.googleapis.com/auth/cloud-platform";

export function parseDelegateCredentials() {
  const raw = config.googleWalletDelegateCredentialsJson;
  if (!raw) return null;
  try {
    const creds = JSON.parse(raw);
    if (creds.type === "authorized_user" && creds.refresh_token) return creds;
    return null;
  } catch {
    return null;
  }
}

export function useWalletImpersonation() {
  return Boolean(
    config.googleWalletIssuerId &&
      config.googleWalletServiceAccountEmail &&
      parseDelegateCredentials()
  );
}

async function impersonatedClient() {
  const creds = parseDelegateCredentials();
  if (!creds) throw new Error("Google Wallet delegate credentials not configured");
  const sourceAuth = new GoogleAuth({ credentials: creds, scopes: [CLOUD_SCOPE] });
  const sourceClient = await sourceAuth.getClient();
  return new Impersonated({
    sourceClient,
    targetPrincipal: config.googleWalletServiceAccountEmail,
    delegates: [],
    targetScopes: [WALLET_SCOPE],
    lifetime: 3600
  });
}

export async function getWalletAccessToken() {
  const client = await impersonatedClient();
  const token = await client.getAccessToken();
  if (!token.token) throw new Error("Could not obtain Google Wallet access token");
  return token.token;
}

export async function signSaveJwtWithImpersonation(payload) {
  const email = config.googleWalletServiceAccountEmail;
  if (!email) throw new Error("GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL not set");

  const now = Math.floor(Date.now() / 1000);
  const origins = config.googleWalletOrigins.length
    ? config.googleWalletOrigins
    : [config.publicSiteOrigin.replace(/\/$/, "")];

  const claims = {
    iss: email,
    aud: "google",
    origins,
    typ: "savetowallet",
    iat: now,
    payload
  };

  const sourceAuth = new GoogleAuth({
    credentials: parseDelegateCredentials(),
    scopes: [CLOUD_SCOPE]
  });
  const sourceClient = await sourceAuth.getClient();
  const token = await sourceClient.getAccessToken();
  if (!token.token) throw new Error("Could not obtain delegate access token");

  // IAM signJwt expects the JWT claim set as a JSON string (not header.claims).
  const signRes = await fetch(
    `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(email)}:signJwt`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token.token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ payload: JSON.stringify(claims) })
    }
  );
  const signJson = await signRes.json();
  if (!signRes.ok) throw new Error(signJson.error?.message || "signJwt failed");
  return signJson.signedJwt;
}
