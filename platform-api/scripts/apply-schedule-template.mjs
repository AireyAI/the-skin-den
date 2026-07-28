#!/usr/bin/env node
/**
 * Overwrite live schedule.json with seed/schedule.template.json.
 * Run on Railway: railway run node scripts/apply-schedule-template.mjs
 * (from platform-api root, with KK_DATA_DIR set).
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const apiRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = process.env.KK_DATA_DIR || join(apiRoot, "data");
const templatePath = join(apiRoot, "seed/schedule.template.json");
const dest = join(dataDir, "schedule.json");

const force = process.argv.includes("--force");
if (existsSync(dest) && !force) {
  console.error(`Refusing to overwrite ${dest} without --force`);
  process.exit(1);
}

const doc = JSON.parse(readFileSync(templatePath, "utf8"));
mkdirSync(dataDir, { recursive: true });
writeFileSync(dest, JSON.stringify(doc, null, 2) + "\n", "utf8");
console.log(`Wrote ${doc.offerings.length} offerings to ${dest}`);
