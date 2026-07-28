#!/usr/bin/env bash
# Generate Pass Type ID key + CSR for Apple Developer upload.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIR="$ROOT/.apple-pass"
PASS_TYPE="${APPLE_PASS_TYPE_ID:-pass.co.uk.kettlekulture.membership}"

mkdir -p "$DIR"
chmod 700 "$DIR"

if [[ -f "$DIR/pass.key" ]]; then
  echo "pass.key already exists in .apple-pass — delete it first if you need a new CSR."
  exit 1
fi

openssl genrsa -out "$DIR/pass.key" 2048
openssl req -new -key "$DIR/pass.key" -out "$DIR/pass.csr" -subj "/CN=Pass Type ID ${PASS_TYPE}/O=Kettle Kulture/C=GB"

echo "$PASS_TYPE" > "$DIR/pass-type-id.txt"

curl -fsSL -o "$DIR/AppleWWDRCAG4.cer" https://www.apple.com/certificateauthority/AppleWWDRCAG4.cer
openssl x509 -inform DER -in "$DIR/AppleWWDRCAG4.cer" -out "$DIR/AppleWWDRCAG4.pem"

echo ""
echo "Next:"
echo "  1. Apple Developer → Pass Type ID ${PASS_TYPE} → Create Certificate"
echo "  2. Upload: $DIR/pass.csr"
echo "  3. Download pass.cer into $DIR/"
echo "  4. bash scripts/apple-pass-import-cer.sh"
echo "  5. Put Team ID in $DIR/team-id.txt"
echo "  6. node scripts/push-apple-pass-railway.mjs"
