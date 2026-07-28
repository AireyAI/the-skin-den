#!/usr/bin/env node
/**
 * Build a test .pkpass when .apple-pass/ or env PEMs are present.
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, existsSync } from "node:fs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = join(root, ".apple-pass");

function load(name, env) {
  if (process.env[env]) return process.env[env];
  const p = join(dir, name);
  if (existsSync(p)) return readFileSync(p, "utf8");
  return "";
}

process.env.APPLE_PASS_TYPE_ID =
  process.env.APPLE_PASS_TYPE_ID || (existsSync(join(dir, "pass-type-id.txt")) ? readFileSync(join(dir, "pass-type-id.txt"), "utf8").trim() : "pass.co.uk.kettlekulture.membership");
process.env.APPLE_TEAM_ID = process.env.APPLE_TEAM_ID || (existsSync(join(dir, "team-id.txt")) ? readFileSync(join(dir, "team-id.txt"), "utf8").trim() : "");
process.env.APPLE_PASS_CERT_PEM = load("pass.pem", "APPLE_PASS_CERT_PEM");
process.env.APPLE_PASS_KEY_PEM = load("pass.key", "APPLE_PASS_KEY_PEM");
process.env.APPLE_WWDR_CERT_PEM = load("AppleWWDRCAG4.pem", "APPLE_WWDR_CERT_PEM");

const { isAppleWalletEnabled, buildApplePkPass } = await import("../src/apple-wallet-pass.mjs");

if (!isAppleWalletEnabled()) {
  console.error("Apple Wallet not configured locally — complete docs/APPLE-WALLET-SETUP.md");
  process.exit(1);
}

const buf = await buildApplePkPass({
  user: { id: "verify-user", email: "verify@example.com", name: "Verify Member" },
  membership: null
});
const out = "/tmp/kk-test.pkpass";
writeFileSync(out, buf);
console.log(`Wrote ${out} (${buf.length} bytes). AirDrop to iPhone or open on Mac.`);
