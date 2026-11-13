# Apple Pay / card deposits — The Skin Den

> **2026-11-13: superseded.** Clockwork is no longer used by The Skin Den, and the site and client account take no payments. Rachel takes payments with Square payment links she makes in her own Square account; the staff dashboard has an "Open Square payment links" button. See `docs/adr/0001-square-payment-links-no-clockwork.md`. The notes below are history.

**Status (2026-07-29): Online payouts paused.** The Clockwork Stripe platform account is closed. Stripe Express Connect is **disabled** for `the-skin-den` until a replacement payments provider is wired.

## Admin UI

- `SITE_CONFIG.payments.stripeConnectEnabled = false`
- Dashboard shows “Online payouts paused” — **Set up payouts** button is hidden/disabled
- Clockwork `POST/GET /api/m/the-skin-den/connect/link` returns `503 STRIPE_CONNECT_DISABLED`

## Client path

- Account email sign-in still works
- In-account treatment booking stays gated until `paymentReady` (will stay false until new provider)
- Use WhatsApp / bank transfer for payment meantime

## When a new platform is chosen

1. Wire Clockwork (or replacement) to the new provider
2. Set `SITE_CONFIG.payments.stripeConnectEnabled = true` only if using Stripe Connect again
3. Remove `the-skin-den` hard-disable in `src/lib/stripe/connect-disabled.ts` (or clear `STRIPE_CONNECT_DISABLED*`)
4. Re-register Apple Pay / wallet domains on the new account if applicable
