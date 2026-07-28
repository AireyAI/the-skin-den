#!/usr/bin/env bash
# Push .stripe-provision.local to linked Railway service (values not echoed).
set -euo pipefail
cd "$(dirname "$0")/.."
FILE=".stripe-provision.local"
if [[ ! -f "$FILE" ]]; then
  echo "Missing $FILE — run: node scripts/provision-stripe.mjs" >&2
  exit 1
fi
set -a
# shellcheck disable=SC1090
source "$FILE"
set +a
for key in STRIPE_SECRET_KEY STRIPE_CONNECT_ACCOUNT_ID STRIPE_WEBHOOK_SECRET PLATFORM_FEE_BPS KK_PUBLIC_SITE_ORIGIN KK_CORS_ORIGINS; do
  val="${!key:-}"
  if [[ -z "$val" ]]; then
    echo "Missing $key in $FILE" >&2
    exit 1
  fi
  railway variables set "${key}=${val}"
done
echo "Done — Stripe vars on Railway platform-api."
