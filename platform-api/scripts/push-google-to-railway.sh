#!/usr/bin/env bash
# Push .google-provision.local to linked Railway service (values not echoed).
set -euo pipefail
cd "$(dirname "$0")/.."
FILE=".google-provision.local"
if [[ ! -f "$FILE" ]]; then
  echo "Missing $FILE — run: node scripts/provision-google.mjs" >&2
  exit 1
fi
set -a
# shellcheck disable=SC1090
source "$FILE"
set +a
for key in GOOGLE_CLIENT_ID GOOGLE_WALLET_ISSUER_ID GOOGLE_WALLET_SERVICE_ACCOUNT_JSON GOOGLE_WALLET_CLASS_SUFFIX GOOGLE_WALLET_ISSUER_NAME GOOGLE_WALLET_PROGRAM_NAME GOOGLE_WALLET_LOGO_URL GOOGLE_WALLET_BRAND_COLOR GOOGLE_WALLET_ORIGINS; do
  val="${!key:-}"
  if [[ -z "$val" ]]; then
    echo "Skip empty $key (fill in $FILE when ready)" >&2
    continue
  fi
  railway variables set "${key}=${val}"
done
echo "Done — Google vars pushed (empty keys skipped). Redeploy platform-api."
