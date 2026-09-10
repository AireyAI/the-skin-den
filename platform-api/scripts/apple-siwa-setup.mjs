#!/usr/bin/env node
/**
 * Fix The Skin Den Sign in with Apple for web.
 * Creates a real SERVICES ID (web) linked to com.theskinden.app primary,
 * and writes the domain association file for deploy.
 *
 *   node platform-api/scripts/apple-siwa-setup.mjs
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const TEAM = "8W4NK3AJQN";
const APP_BUNDLE = "com.theskinden.app";
const WRONG_WEB_ID = "FQAABGN2FN"; // UNIVERSAL mistaken "web" id
const DOMAIN = "theskinden.co.uk";
const RETURN_URL = "https://theskinden.co.uk/account/";

const keyId = process.env.APP_STORE_CONNECT_API_KEY_KEY_ID || "77D6884M39";
const issuerId =
  process.env.APP_STORE_CONNECT_API_KEY_ISSUER_ID || "cd8e015a-39b8-462c-ab59-51526daaf4ca";
const keyPath =
  process.env.APP_STORE_CONNECT_API_KEY_KEY_FILEPATH ||
  process.env.APP_STORE_CONNECT_API_KEY_PATH ||
  "/Users/kyleairey/.appstore-keys/AuthKey_77D6884M39.p8";

function jwtToken() {
  const py = spawnSync(
    "python3",
    [
      "-c",
      `import jwt, time
key=open(${JSON.stringify(keyPath)}).read()
print(jwt.encode({'iss':${JSON.stringify(issuerId)},'exp':int(time.time())+1200,'aud':'appstoreconnect-v1'}, key, algorithm='ES256', headers={'kid':${JSON.stringify(keyId)}}))`,
    ],
    { encoding: "utf8" },
  );
  if (py.status !== 0) throw new Error(py.stderr || "JWT generation failed");
  return py.stdout.trim();
}

async function api(method, path, body) {
  const res = await fetch(`https://api.appstoreconnect.apple.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${jwtToken()}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
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

async function ensureAppPrimary() {
  const list = await api("GET", `/bundleIds?filter[identifier]=${APP_BUNDLE}`);
  const app = list.json.data?.[0];
  if (!app) throw new Error(`Missing ${APP_BUNDLE}`);
  const caps = await api("GET", `/bundleIds/${app.id}/bundleIdCapabilities`);
  const has = caps.json.data?.some((c) => c.attributes?.capabilityType === "APPLE_ID_AUTH");
  if (has) return app.id;
  const created = await api("POST", "/bundleIdCapabilities", {
    data: {
      type: "bundleIdCapabilities",
      attributes: {
        capabilityType: "APPLE_ID_AUTH",
        settings: [
          {
            key: "APPLE_ID_AUTH_APP_CONSENT",
            options: [{ key: "PRIMARY_APP_CONSENT" }],
          },
        ],
      },
      relationships: {
        bundleId: { data: { type: "bundleIds", id: app.id } },
      },
    },
  });
  if (created.status !== 201) {
    throw new Error(`App SIWA failed: ${JSON.stringify(created.json)}`);
  }
  return app.id;
}

async function stripWrongWebPrimary() {
  const del = await api("DELETE", `/bundleIdCapabilities/${WRONG_WEB_ID}_APPLE_ID_AUTH`);
  console.log("Strip mistaken UNIVERSAL web SIWA:", del.status);
}

async function ensureServicesId(appConsentId) {
  // ASC API no longer accepts platform: SERVICES on POST /bundleIds.
  // Look for an existing Services ID only; portal creates new ones.
  const candidates = ["com.theskinden.signin", "com.theskinden.web"];
  for (const identifier of candidates) {
    const list = await api("GET", `/bundleIds?filter[identifier]=${identifier}`);
    const existing = list.json.data?.[0];
    if (!existing) continue;
    console.log("exists", identifier, existing.attributes.platform, existing.id);
    if (existing.attributes.platform === "SERVICES") {
      const caps = await api("GET", `/bundleIds/${existing.id}/bundleIdCapabilities`);
      const has = caps.json.data?.some((c) => c.attributes?.capabilityType === "APPLE_ID_AUTH");
      if (!has) {
        const r = await api("POST", "/bundleIdCapabilities", {
          data: {
            type: "bundleIdCapabilities",
            attributes: { capabilityType: "APPLE_ID_AUTH", settings: [] },
            relationships: {
              bundleId: { data: { type: "bundleIds", id: existing.id } },
              appConsentBundleId: { data: { type: "bundleIds", id: appConsentId } },
            },
          },
        });
        console.log("SIWA on services:", r.status, JSON.stringify(r.json).slice(0, 400));
      }
      return { id: existing.id, identifier };
    }
  }
  console.warn("No SERVICES Sign in with Apple ID found — create one in Apple Developer portal.");
  return { id: "(portal)", identifier: "com.theskinden.signin" };
}

function writeDomainAssociation() {
  const dir = join(root, ".well-known");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "apple-developer-domain-association.txt");
  writeFileSync(
    path,
    JSON.stringify({ webcredentials: { apps: [`${TEAM}.${APP_BUNDLE}`] } }, null, 2) + "\n",
    "utf8",
  );
  console.log("Wrote", path);
}

async function main() {
  if (!existsSync(keyPath)) {
    console.error("Missing ASC API key at", keyPath);
    process.exit(1);
  }

  const appId = await ensureAppPrimary();
  console.log("App primary SIWA:", APP_BUNDLE, appId);
  await stripWrongWebPrimary();
  const services = await ensureServicesId(appId);
  writeDomainAssociation();

  console.log(`
NEXT (Apple Developer portal — API cannot set web domains/return URLs):
  1. Open Services ID ${services.identifier} (${services.id})
     https://developer.apple.com/account/resources/identifiers/list/serviceId
  2. Sign in with Apple → Configure
  3. Primary App ID: ${APP_BUNDLE}
  4. Domains: ${DOMAIN}
  5. Return URLs: ${RETURN_URL}
  6. Download verification file if Apple offers one — overwrite
     .well-known/apple-developer-domain-association.txt then redeploy site

Railway: set APPLE_CLIENT_ID=${services.identifier}
`);
  console.log(JSON.stringify({ servicesIdent: services.identifier, servicesId: services.id }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
