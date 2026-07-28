#!/usr/bin/env bash
# Convert downloaded Pass Type ID .cer to pass.pem for Railway.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIR="$ROOT/.apple-pass"

if [[ ! -f "$DIR/pass.cer" ]]; then
  echo "Missing $DIR/pass.cer — download it from Apple Developer after uploading pass.csr"
  exit 1
fi

openssl x509 -inform DER -in "$DIR/pass.cer" -out "$DIR/pass.pem"
echo "Wrote $DIR/pass.pem"
echo "Run: node scripts/verify-apple-pass-local.mjs"
