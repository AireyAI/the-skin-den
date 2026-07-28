#!/usr/bin/env node
/**
 * Parse .google-provision.local (values may contain spaces) and push to Railway.
 * Usage: node scripts/push-google-railway.mjs [--dry-run]
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const apiRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const file = join(apiRoot, ".google-provision.local");

function parseLocalEnv(text) {
  const env = {};
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    env[key] = val;
  }
  return env;
}

const keys = [
  "GOOGLE_CLIENT_ID",
  "GOOGLE_WALLET_ISSUER_ID",
  "GOOGLE_WALLET_SERVICE_ACCOUNT_JSON",
  "GOOGLE_WALLET_CLASS_SUFFIX",
  "GOOGLE_WALLET_ISSUER_NAME",
  "GOOGLE_WALLET_PROGRAM_NAME",
  "GOOGLE_WALLET_LOGO_URL",
  "GOOGLE_WALLET_BRAND_COLOR",
  "GOOGLE_WALLET_ORIGINS",
  "GOOGLE_WALLET_HERO_URL"
];

if (!existsSync(file)) {
  console.error("Missing", file);
  process.exit(1);
}

const env = parseLocalEnv(readFileSync(file, "utf8"));
const dry = process.argv.includes("--dry-run");
let pushed = 0;

for (const key of keys) {
  const val = env[key];
  if (!val) {
    console.warn("Skip empty", key);
    continue;
  }
  if (dry) {
    console.log("Would set", key, `(${val.length} chars)`);
    pushed++;
    continue;
  }
  const r = spawnSync("railway", ["variables", "set", `${key}=${val}`], {
    cwd: apiRoot,
    stdio: "inherit"
  });
  if (r.status !== 0) process.exit(r.status || 1);
  pushed++;
}

console.log(`Done — ${pushed} variable(s) ${dry ? "would be " : ""}pushed. Redeploy platform-api.`);
