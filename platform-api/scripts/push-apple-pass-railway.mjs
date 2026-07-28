#!/usr/bin/env node
/**
 * Push Apple Wallet signing material to Railway (never commit PEMs).
 *
 * Place files in platform-api/.apple-pass/ (gitignored):
 *   pass.pem          — Pass Type ID certificate (PEM)
 *   pass.key          — private key (PEM)
 *   AppleWWDRCAG4.pem — Apple WWDR intermediate (PEM)
 *   team-id.txt       — 10-character Team ID
 *
 * Or set env: APPLE_TEAM_ID, APPLE_PASS_TYPE_ID, APPLE_PASS_CERT_PEM, APPLE_PASS_KEY_PEM, APPLE_WWDR_CERT_PEM
 *
 *   node scripts/push-apple-pass-railway.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = join(root, ".apple-pass");

function readOrEnv(fileName, envName) {
  if (process.env[envName]) return process.env[envName].trim();
  const p = join(dir, fileName);
  if (existsSync(p)) return readFileSync(p, "utf8").trim();
  return "";
}

const teamId = process.env.APPLE_TEAM_ID || readOrEnv("team-id.txt", "APPLE_TEAM_ID");
const passTypeId =
  process.env.APPLE_PASS_TYPE_ID || readOrEnv("pass-type-id.txt", "APPLE_PASS_TYPE_ID") || "pass.co.uk.kettlekulture.membership";
const certPem = readOrEnv("pass.pem", "APPLE_PASS_CERT_PEM");
const keyPem = readOrEnv("pass.key", "APPLE_PASS_KEY_PEM");
const wwdrPem = readOrEnv("AppleWWDRCAG4.pem", "APPLE_WWDR_CERT_PEM");
const passphrase = process.env.APPLE_PASS_KEY_PASSPHRASE || "";

const missing = [];
if (!teamId) missing.push("APPLE_TEAM_ID or .apple-pass/team-id.txt");
if (!certPem) missing.push("APPLE_PASS_CERT_PEM or .apple-pass/pass.pem");
if (!keyPem) missing.push("APPLE_PASS_KEY_PEM or .apple-pass/pass.key");
if (!wwdrPem) missing.push("APPLE_WWDR_CERT_PEM or .apple-pass/AppleWWDRCAG4.pem");
if (missing.length) {
  console.error("Missing Apple Wallet credentials:\n  · " + missing.join("\n  · "));
  console.error("\nSee docs/APPLE-WALLET-SETUP.md");
  process.exit(1);
}

const vars = [
  ["APPLE_PASS_TYPE_ID", passTypeId],
  ["APPLE_TEAM_ID", teamId],
  ["APPLE_PASS_CERT_PEM", certPem],
  ["APPLE_PASS_KEY_PEM", keyPem],
  ["APPLE_WWDR_CERT_PEM", wwdrPem]
];
if (passphrase) vars.push(["APPLE_PASS_KEY_PASSPHRASE", passphrase]);

for (const [k, v] of vars) {
  const r = spawnSync("railway", ["variables", "set", `${k}=${v}`], {
    cwd: root,
    stdio: "inherit"
  });
  if (r.status !== 0) process.exit(r.status || 1);
}
console.log("Apple Wallet env pushed. Redeploy platform-api, then verify:");
console.log("  curl -s https://platform-api-production-8a3b.up.railway.app/v1/public/config | jq .appleWalletEnabled");
