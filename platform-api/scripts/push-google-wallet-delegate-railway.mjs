#!/usr/bin/env node
/**
 * Push Google Wallet impersonation credentials to Railway (never commit JSON).
 *
 * Reads authorized_user JSON from:
 *   GOOGLE_WALLET_DELEGATED_CREDENTIALS_JSON env, or
 *   GOOGLE_APPLICATION_CREDENTIALS file, or
 *   ~/.config/gcloud/application_default_credentials.json
 *
 * Also sets GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL (wallet SA to impersonate).
 */
import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SA_EMAIL =
  process.env.GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL ||
  "kk-wallet-pass@august-boulder-498017-f3.iam.gserviceaccount.com";

function loadDelegateJson() {
  if (process.env.GOOGLE_WALLET_DELEGATED_CREDENTIALS_JSON) {
    return process.env.GOOGLE_WALLET_DELEGATED_CREDENTIALS_JSON.trim();
  }
  const paths = [
    process.env.GOOGLE_APPLICATION_CREDENTIALS,
    join(homedir(), ".config/gcloud/application_default_credentials.json")
  ].filter(Boolean);
  for (const p of paths) {
    if (existsSync(p)) return readFileSync(p, "utf8").trim();
  }
  return "";
}

const delegateJson = loadDelegateJson();
if (!delegateJson) {
  console.error("Missing delegate credentials. Run: gcloud auth application-default login");
  process.exit(1);
}
JSON.parse(delegateJson);

for (const [k, v] of [
  ["GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL", SA_EMAIL],
  ["GOOGLE_WALLET_DELEGATED_CREDENTIALS_JSON", delegateJson]
]) {
  const r = spawnSync("railway", ["variables", "set", `${k}=${v}`], {
    cwd: root,
    stdio: "inherit"
  });
  if (r.status !== 0) process.exit(r.status || 1);
}
console.log("Delegate wallet auth pushed. Redeploy platform-api.");
