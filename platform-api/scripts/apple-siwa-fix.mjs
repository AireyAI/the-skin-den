#!/usr/bin/env node
/**
 * Fix Kettle Kulture Sign in with Apple branding (never Blakey Trades).
 * Uses App Store Connect API (same key as EAS submit in blakey-trades-native).
 *
 *   node scripts/apple-siwa-fix.mjs
 *
 * Requires env or defaults:
 *   APP_STORE_CONNECT_API_KEY_KEY_ID / KEY_FILEPATH / ISSUER_ID
 */
import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const TEAM = "8W4NK3AJQN";
const WEB_BUNDLE = "com.kettlekulture.web";
const APP_BUNDLE = "com.kettlekulture.app";
const WEB_BUNDLE_ID = "5J8GN5LLWK";

const keyId = process.env.APP_STORE_CONNECT_API_KEY_KEY_ID || "77D6884M39";
const issuerId =
  process.env.APP_STORE_CONNECT_API_KEY_ISSUER_ID || "cd8e015a-39b8-462c-ab59-51526daaf4ca";
const keyPath =
  process.env.APP_STORE_CONNECT_API_KEY_KEY_FILEPATH ||
  process.env.APP_STORE_CONNECT_API_KEY_PATH ||
  "/Users/kyleairey/.appstore-keys/AuthKey_77D6884M39.p8";

function jwt() {
  const py = spawnSync(
    "python3",
    [
      "-c",
      `import jwt, time
key=open(${JSON.stringify(keyPath)}).read()
print(jwt.encode({'iss':${JSON.stringify(issuerId)},'exp':int(time.time())+1200,'aud':'appstoreconnect-v1'}, key, algorithm='ES256', headers={'kid':${JSON.stringify(keyId)}}))`
    ],
    { encoding: "utf8" }
  );
  if (py.status !== 0) throw new Error(py.stderr || "JWT generation failed");
  return py.stdout.trim();
}

async function api(method, path, body) {
  const res = await fetch(`https://api.appstoreconnect.apple.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${jwt()}`,
      "Content-Type": "application/json"
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  return { status: res.status, json };
}

async function ensureAppBundleId() {
  const list = await api("GET", `/bundleIds?filter[identifier]=${APP_BUNDLE}`);
  if (list.json.data?.length) return list.json.data[0].id;

  const created = await api("POST", "/bundleIds", {
    data: {
      type: "bundleIds",
      attributes: {
        identifier: APP_BUNDLE,
        name: "Kettle Kulture",
        platform: "UNIVERSAL",
        seedId: TEAM
      }
    }
  });
  if (created.status !== 201) {
    throw new Error(`Could not create ${APP_BUNDLE}: ${JSON.stringify(created.json)}`);
  }
  return created.json.data.id;
}

async function ensureAppPrimaryConsent(appResourceId) {
  const get = await api("GET", `/bundleIds/${appResourceId}/bundleIdCapabilities`);
  if (get.json.data?.some((c) => c.attributes?.capabilityType === "APPLE_ID_AUTH")) return;

  const created = await api("POST", "/bundleIdCapabilities", {
    data: {
      type: "bundleIdCapabilities",
      attributes: {
        capabilityType: "APPLE_ID_AUTH",
        settings: [
          {
            key: "APPLE_ID_AUTH_APP_CONSENT",
            options: [{ key: "PRIMARY_APP_CONSENT" }]
          }
        ]
      },
      relationships: {
        bundleId: { data: { type: "bundleIds", id: appResourceId } }
      }
    }
  });
  if (created.status !== 201) {
    console.warn("App APPLE_ID_AUTH:", created.status, JSON.stringify(created.json).slice(0, 400));
  }
}

async function ensureWebSiwa(appConsentResourceId) {
  const caps = await api("GET", `/bundleIds/${WEB_BUNDLE_ID}/bundleIdCapabilities`);
  const has = caps.json.data?.some((c) => c.attributes?.capabilityType === "APPLE_ID_AUTH");
  if (has) {
    console.log("Web Services ID already has APPLE_ID_AUTH capability.");
    return true;
  }

  // Apple requires appConsentBundleId on create; public schema may reject it — try both shapes.
  const attempts = [
    {
      data: {
        type: "bundleIdCapabilities",
        attributes: { capabilityType: "APPLE_ID_AUTH", settings: [] },
        relationships: {
          bundleId: { data: { type: "bundleIds", id: WEB_BUNDLE_ID } },
          appConsentBundleId: { data: { type: "bundleIds", id: appConsentResourceId } }
        }
      }
    },
    {
      data: {
        type: "bundleIdCapabilities",
        attributes: { capabilityType: "APPLE_ID_AUTH", settings: [] },
        relationships: {
          bundleId: { data: { type: "bundleIds", id: WEB_BUNDLE_ID } }
        }
      }
    }
  ];

  for (const body of attempts) {
    const r = await api("POST", "/bundleIdCapabilities", body);
    if (r.status === 201) {
      console.log("Restored APPLE_ID_AUTH on", WEB_BUNDLE);
      return true;
    }
    console.warn("Capability create attempt:", r.status, JSON.stringify(r.json).slice(0, 500));
  }
  return false;
}

async function main() {
  if (!existsSync(keyPath)) {
    console.error("Missing ASC API key at", keyPath);
    process.exit(1);
  }

  console.log("Ensuring App ID", APP_BUNDLE, "…");
  const appId = await ensureAppBundleId();
  console.log("App resource id:", appId);
  await ensureAppPrimaryConsent(appId);

  const ok = await ensureWebSiwa(appId);
  const websiteRoot = join(root, "..", "website", ".well-known", "apple-developer-domain-association.txt");
  const { writeFileSync } = await import("node:fs");
  writeFileSync(
    websiteRoot,
    JSON.stringify({ webcredentials: { apps: [`${TEAM}.${APP_BUNDLE}`] } }, null, 2) + "\n",
    "utf8"
  );

  if (!ok) {
    console.error(`
Could not restore Sign in with Apple on ${WEB_BUNDLE} via API alone.
Open Apple Developer (logged in) and fix manually:
  https://developer.apple.com/account/resources/identifiers/serviceId/edit/${WEB_BUNDLE_ID}

  1. Enable Sign in with Apple → Configure
  2. Primary App ID: ${APP_BUNDLE} (Kettle Kulture) — NOT Blakey Trades
  3. Domains: kettlekulture.co.uk · Return URL: https://kettlekulture.co.uk/account/
  4. Download domain verification file → overwrite website/.well-known/apple-developer-domain-association.txt
  5. Deploy website (Vercel)
`);
    process.exit(2);
  }

  console.log("Updated domain association file (deploy website next).");
  console.log("Run: node website/scripts/verify-apple-domain-association.mjs");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
