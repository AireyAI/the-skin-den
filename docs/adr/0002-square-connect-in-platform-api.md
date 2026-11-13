# ADR 0002: Connect Rachel's Square account to the staff dashboard through the Skin Den platform-api

- Status: **Accepted 2026-11-13** (Kyle: "Yes, both"). Extends ADR 0001 (Clockwork removed; Square payment links), and replaces its "no integration" point.
- Spec: `docs/specs/2026-11-13--square-connect-dashboard.md`

## Context
ADR 0001 gave the dashboard a plain button to Square's payment-links page. Kyle now wants the client to connect her Square account to the dashboard, so payments are set up and tracked there. The dashboard is static (GitHub Pages). Its backend is the Skin Den-only `platform-api` on Railway: a hand-rolled Node HTTP server with SQLite, coach JWT sign-in, an existing raw-body webhook path and a `processed_events` table. Kyle's `square-client-payments` skill defines the seller-OAuth invariants, and Peaceful Petals has a working implementation of them to adapt.

## Decision
1. **Build it in `platform-api`.** It already authenticates the studio owner and holds the Skin Den's data, and nothing else in this stack has a server. The Square code is adapted from the Peaceful Petals invariants (state binding, AES-GCM tokens, signed webhooks, independent payment checks), not copied.
2. **Use a dedicated Square application, "The Skin Den",** under Kyle's existing developer account. The client's data and credentials stay separate from Clockwork/Air Bookings and from Kettle Kulture.
3. **Use payment links (the Checkout API).** No on-site card form, no stored cards and no booking-time payment.
4. **Return OAuth to the static dashboard,** which completes the connection through an authenticated POST. No new public pages.
5. **Use a daily in-process renewal timer,** following the `backup.mjs` pattern, rather than a new cron service. That means no new hosting cost.

## Consequences
- **Railway gains Square secrets** in the Production scope only. The encryption key must survive redeploys, or Rachel will need to reconnect.
- **The SQLite volume** on Railway now holds encrypted seller tokens. Backups (`backup.mjs`) include them, encrypted. The key is never stored with the backups.
- **If `platform-api` sleeps or restarts,** renewal still runs on next boot and on use. Square access tokens last weeks, so a missed day is harmless.
- **The dashboard depends on `platform-api`** for payments. If the API is down, Rachel can still use Square directly, and the plain payment-links button remains as a fallback.
- **Rachel can disconnect at any time,** in the dashboard or in Square. The webhook handles revocation.

## Alternatives considered
- **Keep the plain link (ADR 0001).** Simplest, but nothing is tracked in the dashboard and the client isn't "connected". Kyle asked for more.
- **Reuse Clockwork's multi-tenant Square app.** Clockwork was removed from The Skin Den, and its production Square setup has open gates.
- **A Cloudflare Worker like Peaceful Petals.** It would add a new service and a second data store next to the existing `platform-api`.
- **Square Online Checkout embedded on the public site.** Out of scope: there are no online payments on the site.
