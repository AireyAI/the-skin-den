import { createSign } from "node:crypto";
import { config } from "./config.mjs";
import {
  walletPassObjectKey,
  walletBarcodeForPass,
  walletLoyaltyPoints,
  walletRenewalModuleBody
} from "./wallet-pass.mjs";
import { GoogleAuth } from "google-auth-library";
import {
  useWalletImpersonation,
  getWalletAccessToken,
  signSaveJwtWithImpersonation
} from "./google-wallet-auth.mjs";

function useWalletProxy() {
  return Boolean(
    config.googleWalletIssuerId &&
      config.googleWalletProxyUrl &&
      config.googleWalletProxySecret
  );
}

function walletConfigured() {
  if (!config.googleWalletIssuerId) return false;
  if (config.googleWalletServiceAccount) return true;
  if (useWalletImpersonation()) return true;
  return useWalletProxy();
}

function classId() {
  return `${config.googleWalletIssuerId}.${config.googleWalletClassSuffix}`;
}

function objectIdForMember(memberId) {
  const safe = String(memberId).replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${config.googleWalletIssuerId}.${safe}`;
}

function parseServiceAccount() {
  if (!config.googleWalletServiceAccount) return null;
  try {
    return JSON.parse(config.googleWalletServiceAccount);
  } catch {
    return null;
  }
}


async function callWalletProxy({ user, membership, qrValue }) {
  const res = await fetch(config.googleWalletProxyUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-wallet-proxy-secret": config.googleWalletProxySecret
    },
    body: JSON.stringify({ user, membership, qrValue })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText || "Wallet proxy failed");
  return data;
}

async function walletFetch(path, { method = "GET", body } = {}) {
  let accessToken;
  if (useWalletImpersonation()) {
    accessToken = await getWalletAccessToken();
  } else {
    const sa = parseServiceAccount();
    if (!sa) throw new Error("Google Wallet service account not configured");
    const auth = new GoogleAuth({
      credentials: sa,
      scopes: ["https://www.googleapis.com/auth/wallet_object.issuer"]
    });
    const client = await auth.getClient();
    const token = await client.getAccessToken();
    if (!token.token) throw new Error("Could not obtain Google Wallet access token");
    accessToken = token.token;
  }

  const url = `https://walletobjects.googleapis.com/walletobjects/v1${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let json = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    const msg = json.error?.message || json.raw || res.statusText;
    throw new Error(msg);
  }
  return json;
}

export function isGoogleWalletEnabled() {
  return walletConfigured();
}

/** Create loyalty class once per tenant; sync hero + card background on existing class. */
function loyaltyClassAppearanceDoc() {
  const doc = {
    hexBackgroundColor: config.googleWalletBrandColor || "#03191d"
  };
  if (config.googleWalletHeroUrl) {
    doc.heroImage = {
      sourceUri: { uri: config.googleWalletHeroUrl },
      contentDescription: {
        defaultValue: { language: "en-GB", value: config.googleWalletProgramName || "Membership" }
      }
    };
  }
  return doc;
}

export async function ensureGoogleWalletClass() {
  if (!walletConfigured()) return { skipped: true };
  const id = classId();
  const appearance = loyaltyClassAppearanceDoc();
  try {
    await walletFetch(`/loyaltyClass/${encodeURIComponent(id)}`);
    const masks = ["hexBackgroundColor"];
    if (appearance.heroImage) masks.push("heroImage");
    try {
      await walletFetch(
        `/loyaltyClass/${encodeURIComponent(id)}?updateMask=${encodeURIComponent(masks.join(","))}`,
        { method: "PATCH", body: appearance }
      );
    } catch (patchErr) {
      console.warn("[google-wallet] class appearance PATCH skipped:", patchErr.message || patchErr);
    }
    return { id, created: false, updated: true };
  } catch (e) {
    if (!/not found|404/i.test(String(e.message))) throw e;
  }

  const doc = {
    id,
    issuerName: config.googleWalletIssuerName,
    programName: config.googleWalletProgramName,
    programLogo: config.googleWalletLogoUrl
      ? {
          sourceUri: { uri: config.googleWalletLogoUrl },
          contentDescription: { defaultValue: { language: "en-GB", value: config.googleWalletIssuerName } }
        }
      : undefined,
    reviewStatus: "UNDER_REVIEW",
    ...appearance
  };
  await walletFetch("/loyaltyClass", { method: "POST", body: doc });
  return { id, created: true };
}

/** Upsert loyalty object for member; returns object id. */
export async function upsertGoogleWalletObject({ user, membership, qrValue: qrValueIn }) {
  if (!walletConfigured()) throw new Error("Google Wallet is not configured");
  // A saved wallet pass is static; after each door scan we refresh barcode + points (postAdminCheckIn).
  const qrValue = qrValueIn || walletBarcodeForPass({ user, membership });
  const passKey = walletPassObjectKey(user, membership);
  if (useWalletProxy()) {
    const data = await callWalletProxy({ user, membership, qrValue });
    return data.objectId;
  }
  await ensureGoogleWalletClass();

  const id = objectIdForMember(passKey);
  const points = walletLoyaltyPoints(membership);
  const objectDoc = {
    id,
    classId: classId(),
    state: "ACTIVE",
    accountName: user.name || membership?.name || user.email,
    accountId: user.email,
    loyaltyPoints: points,
    barcode: {
      type: "QR_CODE",
      value: qrValue,
      alternateText: passKey
    },
    textModulesData: [
      {
        header: "Renewal",
        body: walletRenewalModuleBody(membership),
        id: "renewal"
      },
      {
        header: "Last class",
        body: membership?.lastClassAt ? membership.lastClassAt.slice(0, 10) : "—",
        id: "last_class"
      }
    ]
  };
  if (config.googleWalletHeroUrl) {
    objectDoc.heroImage = {
      sourceUri: { uri: config.googleWalletHeroUrl },
      contentDescription: {
        defaultValue: { language: "en-GB", value: user.name || membership?.name || "Member" }
      }
    };
  }

  try {
    await walletFetch(`/loyaltyObject/${encodeURIComponent(id)}`);
    const patchBody = {
      state: objectDoc.state,
      accountName: objectDoc.accountName,
      accountId: objectDoc.accountId,
      loyaltyPoints: objectDoc.loyaltyPoints,
      barcode: objectDoc.barcode,
      textModulesData: objectDoc.textModulesData
    };
    const masks = [
      "state",
      "accountName",
      "accountId",
      "loyaltyPoints",
      "barcode",
      "textModulesData"
    ];
    if (objectDoc.heroImage) {
      patchBody.heroImage = objectDoc.heroImage;
      masks.push("heroImage");
    }
    await walletFetch(
      `/loyaltyObject/${encodeURIComponent(id)}?updateMask=${encodeURIComponent(masks.join(","))}`,
      { method: "PATCH", body: patchBody }
    );
  } catch (e) {
    if (!/not found|404/i.test(String(e.message))) throw e;
    await walletFetch("/loyaltyObject", { method: "POST", body: objectDoc });
  }
  return id;
}

async function signSaveJwt(payload) {
  if (useWalletImpersonation()) return signSaveJwtWithImpersonation(payload);
  const sa = parseServiceAccount();
  if (!sa?.client_email || !sa?.private_key) throw new Error("Invalid service account JSON");

  const header = { alg: "RS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const origins = config.googleWalletOrigins.length
    ? config.googleWalletOrigins
    : [config.publicSiteOrigin.replace(/\/$/, "")];

  const claims = {
    iss: sa.client_email,
    aud: "google",
    origins,
    typ: "savetowallet",
    iat: now,
    payload
  };

  const enc = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");
  const data = `${enc(header)}.${enc(claims)}`;
  const sign = createSign("RSA-SHA256");
  sign.update(data);
  sign.end();
  const sig = sign.sign(sa.private_key).toString("base64url");
  return `${data}.${sig}`;
}

/** "Add to Google Wallet" link for a member pass. */
export async function googleWalletSaveUrl({ user, membership }) {
  const qrValue = walletBarcodeForPass({ user, membership });
  if (useWalletProxy()) {
    const data = await callWalletProxy({ user, membership, qrValue });
    return data.saveUrl;
  }
  const objectId = await upsertGoogleWalletObject({ user, membership, qrValue });
  const jwt = await signSaveJwt({
    loyaltyObjects: [{ id: objectId }]
  });
  return `https://pay.google.com/gp/v/save/${jwt}`;
}
