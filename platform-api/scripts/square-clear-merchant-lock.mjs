// Operator only (Kyle): allow a different Square business to connect to The Skin Den.
// Run on the server with the same KK_DATA_DIR / KK_TENANT_SLUG as the API:
//   node scripts/square-clear-merchant-lock.mjs production
import { getDb } from "../src/db.mjs";
import { clearMerchantLock } from "../src/square-oauth.mjs";

const environment = process.argv[2];
if (!["production", "sandbox"].includes(environment)) {
  console.error("Usage: node scripts/square-clear-merchant-lock.mjs production|sandbox");
  process.exit(1);
}
const cleared = clearMerchantLock(getDb(), environment);
console.log(cleared ? `Cleared the ${environment} Square merchant lock.` : `No ${environment} lock was set.`);
