#!/usr/bin/env bash
# Run in Google Cloud Shell (project: august-boulder-498017-f3).
set -euo pipefail
PROJECT=august-boulder-498017-f3
REGION=europe-west2
SA=kk-wallet-pass@${PROJECT}.iam.gserviceaccount.com
SERVICE=kk-wallet-proxy
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

gcloud config set project "$PROJECT"
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com walletobjects.googleapis.com iamcredentials.googleapis.com

# Pay console: invite $SA as Developer (manual once).

export WALLET_PROXY_SECRET="${WALLET_PROXY_SECRET:?Set WALLET_PROXY_SECRET first}"

gcloud run deploy "$SERVICE" \
  --source "$ROOT/cloud-run-wallet" \
  --region "$REGION" \
  --service-account "$SA" \
  --allow-unauthenticated \
  --set-env-vars "GOOGLE_WALLET_ISSUER_ID=3388000000023176237,GOOGLE_WALLET_CLASS_SUFFIX=kettle_kulture,GOOGLE_WALLET_ISSUER_NAME=Kettle Kulture,GOOGLE_WALLET_PROGRAM_NAME=Kettle Kulture Membership,GOOGLE_WALLET_LOGO_URL=https://kettlekulture.co.uk/assets/wallet/pass-logo-v2.png,GOOGLE_WALLET_HERO_URL=https://kettlekulture.co.uk/assets/wallet/pass-strip-v2.png,GOOGLE_WALLET_BRAND_COLOR=#0f0f0f,GOOGLE_WALLET_ORIGINS=https://kettlekulture.co.uk,GOOGLE_WALLET_SA_EMAIL=${SA},WALLET_PROXY_SECRET=${WALLET_PROXY_SECRET}"

URL="$(gcloud run services describe "$SERVICE" --region "$REGION" --format='value(status.url)')"
echo "Proxy URL: $URL"
echo "Railway: GOOGLE_WALLET_PROXY_URL=$URL GOOGLE_WALLET_PROXY_SECRET=(same secret)"
