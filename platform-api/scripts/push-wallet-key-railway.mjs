#!/usr/bin/env node
/**
 * Push Wallet issuer + service account JSON to Railway (never commit the JSON).
 * Usage:
 *   export GOOGLE_WALLET_ISSUER_ID=3388000000023176237
 *   export GOOGLE_WALLET_SERVICE_ACCOUNT_JSON="$(cat /path/to/key.json | jq -c .)"
 *   node scripts/push-wallet-key-railway.mjs
 *
 * Or place minified JSON at .wallet-sa.json (gitignored) and run with no env.
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const keyFile = join(root, ".wallet-sa.json");

const issuer =
  process.env.GOOGLE_WALLET_ISSUER_ID || "3388000000023176237";
let saJson = process.env.GOOGLE_WALLET_SERVICE_ACCOUNT_JSON || "";
if (!saJson && existsSync(keyFile)) {
  saJson = readFileSync(keyFile, "utf8").trim();
}
if (!saJson) {
  console.error(
    "Missing key: set GOOGLE_WALLET_SERVICE_ACCOUNT_JSON or add platform-api/.wallet-sa.json"
  );
  process.exit(1);
}
JSON.parse(saJson);

for (const [k, v] of [
  ["GOOGLE_WALLET_ISSUER_ID", issuer],
  ["GOOGLE_WALLET_SERVICE_ACCOUNT_JSON", saJson]
]) {
  const r = spawnSync("railway", ["variables", "set", `${k}=${v}`], {
    cwd: root,
    stdio: "inherit"
  });
  if (r.status !== 0) process.exit(r.status || 1);
}
console.log("Wallet credentials pushed. Redeploy platform-api.");
