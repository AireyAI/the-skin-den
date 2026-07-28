#!/usr/bin/env node
/**
 * Set Google Wallet Cloud Run proxy URL + shared secret on Railway.
 * Reads secret from .wallet-proxy-secret if GOOGLE_WALLET_PROXY_SECRET unset.
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const secretFile = join(root, ".wallet-proxy-secret");

const proxyUrl = (process.env.GOOGLE_WALLET_PROXY_URL || "").replace(/\/$/, "");
let secret = process.env.GOOGLE_WALLET_PROXY_SECRET || "";
if (!secret && existsSync(secretFile)) secret = readFileSync(secretFile, "utf8").trim();

if (!proxyUrl) {
  console.error("Set GOOGLE_WALLET_PROXY_URL (Cloud Run service URL, no trailing slash)");
  process.exit(1);
}
if (!secret) {
  console.error("Set GOOGLE_WALLET_PROXY_SECRET or create .wallet-proxy-secret");
  process.exit(1);
}

for (const [k, v] of [
  ["GOOGLE_WALLET_PROXY_URL", proxyUrl],
  ["GOOGLE_WALLET_PROXY_SECRET", secret]
]) {
  const r = spawnSync("railway", ["variables", "set", `${k}=${v}`], {
    cwd: root,
    stdio: "inherit"
  });
  if (r.status !== 0) process.exit(r.status || 1);
}
console.log("Proxy env set. Redeploy platform-api, then verify googleWalletEnabled.");
