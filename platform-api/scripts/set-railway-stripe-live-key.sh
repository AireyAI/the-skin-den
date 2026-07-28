#!/usr/bin/env bash
# Replace Railway STRIPE_SECRET_KEY with platform sk_live (Connect + admin require it; rk_live cannot access Connect accounts).
set -euo pipefail
cd "$(dirname "$0")/.."

LIVE_FILE="${STRIPE_LIVE_SECRET_FILE:-$HOME/.aireyai-secrets/stripe.env}"
ALT_FILE="${HOME}/.config/cursor-mcp/stripe-live.secret"

load_key() {
  local f="$1"
  [[ -f "$f" ]] || return 1
  # shellcheck disable=SC1090
  set -a
  source "$f"
  set +a
  if [[ -n "${STRIPE_SECRET_KEY:-}" && "${STRIPE_SECRET_KEY}" == sk_live_* ]]; then
    echo "$STRIPE_SECRET_KEY"
    return 0
  fi
  if [[ -n "${STRIPE_API_KEY:-}" && "${STRIPE_API_KEY}" == sk_live_* ]]; then
    echo "$STRIPE_API_KEY"
    return 0
  fi
  local line
  line="$(grep -E '^(export )?(STRIPE_SECRET_KEY|STRIPE_API_KEY)=' "$f" | head -1 || true)"
  [[ -n "$line" ]] || return 1
  line="${line#export }"
  local val="${line#*=}"
  val="${val%\"}"; val="${val#\"}"; val="${val%\'}"; val="${val#\'}"
  if [[ "$val" == sk_live_* ]]; then
    echo "$val"
    return 0
  fi
  return 1
}

KEY=""
if KEY="$(load_key "$LIVE_FILE")"; then
  :
elif KEY="$(load_key "$ALT_FILE")"; then
  :
else
  echo "No sk_live_ key found." >&2
  echo "Set STRIPE_LIVE_SECRET_FILE or add STRIPE_SECRET_KEY=sk_live_… to:" >&2
  echo "  $LIVE_FILE" >&2
  echo "  $ALT_FILE" >&2
  echo "Or paste from Stripe Dashboard → Developers → API keys → Secret key (live)." >&2
  exit 1
fi

echo "Setting Railway STRIPE_SECRET_KEY to sk_live_… (not printed)."
railway variables set "STRIPE_SECRET_KEY=${KEY}"
echo "Done. Redeploy platform-api if it does not auto-restart, then retry admin → Set up payouts."
