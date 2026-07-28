#!/usr/bin/env node
/**
 * Register Pass Type ID + issue Pass Type ID certificate via App Store Connect API.
 * Writes .apple-pass/pass.cer, pass.pem, team-id.txt
 *
 *   node scripts/apple-pass-provision.mjs
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = join(root, ".apple-pass");
const TEAM = "8W4NK3AJQN";
const PASS_TYPE = "pass.co.uk.kettlekulture.membership";
const PASS_NAME = "Kettle Kulture membership";

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

function csrBase64() {
  const csrPath = join(dir, "pass.csr");
  if (!existsSync(csrPath)) {
    throw new Error(`Missing ${csrPath} — run bash scripts/apple-pass-init.sh first`);
  }
  const pem = readFileSync(csrPath, "utf8");
  const der = spawnSync("openssl", ["req", "-outform", "DER", "-in", csrPath], {
    encoding: "buffer"
  });
  if (der.status !== 0) {
    // CSR file may be PEM-only; strip headers and base64-decode
    const b64 = pem.replace(/-----[^-]+-----/g, "").replace(/\s/g, "");
    return b64;
  }
  return der.stdout.toString("base64");
}

async function ensurePassTypeId() {
  const list = await api("GET", `/passTypeIds?filter[identifier]=${encodeURIComponent(PASS_TYPE)}&limit=200`);
  if (list.json.data?.length) {
    console.log("Pass Type ID exists:", list.json.data[0].id);
    return list.json.data[0].id;
  }

  const created = await api("POST", "/passTypeIds", {
    data: {
      type: "passTypeIds",
      attributes: {
        identifier: PASS_TYPE,
        name: PASS_NAME
      }
    }
  });
  if (created.status !== 201) {
    throw new Error(`Create passTypeId failed: ${created.status} ${JSON.stringify(created.json).slice(0, 800)}`);
  }
  console.log("Created Pass Type ID:", created.json.data.id);
  return created.json.data.id;
}

async function revokeOldPassCerts(passTypeResourceId) {
  const list = await api("GET", `/passTypeIds/${passTypeResourceId}/certificates?limit=50`);
  for (const cert of list.json.data || []) {
    if (cert.attributes?.certificateType === "PASS_TYPE_ID") {
      const del = await api("DELETE", `/certificates/${cert.id}`);
      console.log("Revoked old cert", cert.id, del.status);
    }
  }
}

async function createPassCert(passTypeResourceId) {
  const csrContent = csrBase64();
  const body = {
    data: {
      type: "certificates",
      attributes: {
        certificateType: "PASS_TYPE_ID",
        csrContent
      },
      relationships: {
        passTypeId: {
          data: { type: "passTypeIds", id: passTypeResourceId }
        }
      }
    }
  };
  const created = await api("POST", "/certificates", body);
  if (created.status !== 201) {
    throw new Error(`Create certificate failed: ${created.status} ${JSON.stringify(created.json).slice(0, 1200)}`);
  }
  const certId = created.json.data.id;
  const content = created.json.data.attributes?.certificateContent;
  if (!content) {
    const full = await api("GET", `/certificates/${certId}`);
    if (!full.json.data?.attributes?.certificateContent) {
      throw new Error("No certificateContent in API response");
    }
    return full.json.data.attributes.certificateContent;
  }
  return content;
}

async function main() {
  if (!existsSync(keyPath)) {
    console.error("Missing ASC API key at", keyPath);
    process.exit(1);
  }
  if (!existsSync(join(dir, "pass.key"))) {
    console.error("Missing pass.key — run bash scripts/apple-pass-init.sh");
    process.exit(1);
  }

  writeFileSync(join(dir, "team-id.txt"), TEAM + "\n", "utf8");
  writeFileSync(join(dir, "pass-type-id.txt"), PASS_TYPE + "\n", "utf8");

  const passTypeId = await ensurePassTypeId();
  await revokeOldPassCerts(passTypeId);
  const certB64 = await createPassCert(passTypeId);
  const der = Buffer.from(certB64, "base64");
  writeFileSync(join(dir, "pass.cer"), der);
  const pemOut = spawnSync("openssl", ["x509", "-inform", "DER", "-outform", "PEM"], {
    input: der,
    encoding: "utf8"
  });
  if (pemOut.status !== 0) throw new Error(pemOut.stderr || "openssl x509 failed");
  writeFileSync(join(dir, "pass.pem"), pemOut.stdout, "utf8");
  console.log("Wrote pass.cer + pass.pem");
  console.log("Next: node scripts/push-apple-pass-railway.mjs && railway redeploy --from-source -y");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
