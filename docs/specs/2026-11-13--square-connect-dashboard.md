# Square payments connected to the staff dashboard

Status: **proposed. Awaiting Kyle's approval.** Nothing has been built, configured or deployed for this yet.
Date: 2026-11-13 · ADR: `docs/adr/0002-square-connect-in-platform-api.md` · Plan: `tasks/plan.md`

## Request
Kyle (2026-11-13): "remove everything, get Square payments set up ready for the client connecting the dashboard". The unused dashboard parts are removed separately (branch `admin/remove-unused`). This spec covers the second half. Rachel connects **her own** Square account to the staff dashboard once. She then creates payment links there and sees them marked paid, with the money going straight to her Square account. This follows Kyle's standard `square-client-payments` route.

## What Rachel gets
1. **Connect once.** The Square card in the dashboard shows **Connect Square account**. She signs in to Square, approves, and comes back to the dashboard. It then shows her business name, the location payments go to, and whether the connection is live or test. A **Disconnect** button removes access.
2. **Request a payment.** She picks a client (or types a name), a description (for example "Deposit: Profhilo") and an amount. The dashboard creates a Square payment link and offers **Copy link** and **Send on WhatsApp**, which opens a prefilled message to the client.
3. **See what's paid.** A **Payments** tab lists her links: client, description, amount, status (Waiting, Paid, Refunded) and dates. A link is marked Paid only after Square sends a signed notification and the server has checked the payment with Square itself. The overview shows "Paid with Square (30 days)".
4. **Refunds** are done in her Square dashboard. The refund shows up here as Refunded.

What stays the same: booking by WhatsApp, and no payment on the public site or client account.

## Out of scope (v1)
- Online booking.
- Deposits enforced at booking time.
- Cancelling a link from the dashboard. She can do that in Square for now.
- Partial-refund handling beyond showing the status.
- Card-on-file.
- Membership billing.
- Apple Pay domain setup. Square's hosted checkout handles wallets itself; check this during the pilot.

## Requirements
- **Seller owns the money.** Links are created with Rachel's OAuth token and location only. No platform fee, no AireyAI or developer personal token.
- **One isolated Square application** for The Skin Den under Kyle's existing Square developer account. It is not the Clockwork "Air Bookings" app and not Kettle Kulture's. Only the public application ID and callback URL go in source.
- **Connection security:**
  - The connection is started and completed by the signed-in studio owner, with a sign-in less than 15 minutes old (the coach token's `iat`).
  - OAuth state is random, single-use and expires after 10 minutes. It is stored only as a hash and is bound to:
    - the coach and their token's `jti`;
    - the application and environment;
    - the exact redirect URI.
  - Scopes: `MERCHANT_PROFILE_READ ORDERS_READ ORDERS_WRITE PAYMENTS_READ PAYMENTS_WRITE`. Production sends `session=false`.
  - The callback lands on the static dashboard (`https://theskinden.co.uk/admin/`). The page removes `code` and `state` from the address bar before anything else runs, then completes with an authenticated POST.
  - The server checks:
    - the token's application ID and granted scopes;
    - that the merchant is active in GB;
    - that there is exactly one active GB/GBP location with card processing (`CREDIT_CARD_PROCESSING`).

    If the account has more than one such location, or none, it is refused with a clear message.
  - A connection is never replaced silently: Rachel must disconnect first. Disconnect revokes the grant with Square.
- **Token storage.** Tokens are encrypted with AES-256-GCM. The key is `SQUARE_TOKEN_ENCRYPTION_KEY` (32 bytes, Railway only). The associated data is `applicationId:environment:merchantId`. Tokens never appear in responses, logs or the browser.
- **Token renewal.** Refreshed on use when due, and by a daily in-process job (same pattern as `backup.mjs`). The update is conditional on the old ciphertext, so a disconnect can't be undone by a refresh. Failures show on the dashboard ("Reconnect Square").
- **Payment links:**
  - The amount is integer pence, validated on the server (£1 to £2,000) in GBP, with a description of 1–120 characters.
  - The idempotency key is the link record's own ID.
  - The returned URL must be `https` on a Square host.
  - Square order, link and payment IDs are stored against the record.
- **Webhook** at `POST /v1/square/webhook`:
  - The signature is HMAC-SHA256 over the exact registered URL (from config, never the Host header) plus the raw body. It is base64 and compared in constant time.
  - Events: `payment.created`, `payment.updated`, `refund.created`, `refund.updated`, `oauth.authorization.revoked`.
  - For a payment, the server fetches it from Square with Rachel's token. It must be COMPLETED and match the merchant, location, Square order, GBP and amount before the link is marked Paid.
  - Duplicates are ignored using the existing `processed_events` table.
  - A visit to the success page is never treated as proof of payment.
- **Admin data.** All new endpoints sit under `/v1/admin/square/*`, behind the existing coach JWT and CORS allowlist.

## Changes from the Opus review (2026-11-13), which override anything above
- **Webhook order (blocking fix).**
  1. Fetch and verify the payment with Square first.
  2. Then mark the link and record the event in one transaction.
  3. If Square or the network fails temporarily, answer with a 5xx so Square retries.

  The existing Stripe pattern (record the event, then process it) is not reused.
- **When the sign-in age is checked (blocking fix).** The 15-minute sign-in rule applies when Rachel *starts* a connection and when she disconnects. Completing the connection needs the same token `jti` plus the unexpired, single-use state, so a slow Square login still works. The dashboard says clearly when she needs to sign in again.
- **Merchant lock.** After the first successful connection, only that same Square merchant ID can reconnect. Connecting a different merchant is refused until Kyle clears the lock with a deliberate operator step. This limits what a stolen dashboard token could do, since the token sits in localStorage.
- **jsQR** (scanner, currently hidden) gets an integrity hash or is hosted in the repo.
- **Stuck links.**
  - Each Waiting link has **Check with Square**.
  - The daily job also checks Waiting links, which catches missed webhooks and links deleted in Square.
  - Unpaid links stay Waiting, with their age shown. There's no stock, so nothing expires.
- **Live status.** When the Square card is shown, the connection is checked with Square (cached briefly), not taken from a stored flag. A lost or changed encryption key shows "Reconnect Square" rather than crashing.
- **Error states shown to Rachel:**
  - consent declined (`error=access_denied`);
  - expired code or sign-in;
  - reused state;
  - Square or network errors;
  - a different merchant;
  - more than one location, or none.
- **Return page hygiene.**
  - `admin/index.html` gets `<meta name="referrer" content="no-referrer">`.
  - The first inline `<head>` script clears `code`/`state` from the address before other scripts or fonts load.
  - The redirect URL is fixed, with no "next" parameter.
- **Payment checks.**
  - Match `amount_money` (tipping off).
  - Match on the Square `order_id`, with `reference_id` set to our link record ID as a fallback.
  - Partial refunds show as "Partly refunded".
- **Sandbox path.** The sandbox app's redirect is the local dashboard (`http://localhost:4327/admin/`), with a local `platform-api` pointed at the sandbox. The live API is never pointed at the sandbox. Locally, payment status is confirmed with **Check with Square**. Webhook verification is covered by tests, and in production by Square's "send test event".
- **Renewal timer** runs at boot and then every 24 hours, as `backup.mjs` does, on a single Railway replica.
- **Rachel's phone.** Test the connection on her phone, including from a home-screen shortcut. The site's manifest can open `/admin/` as a standalone app, which may not keep the sign-in through Square's redirect.

## What Rachel must do
1. Have a normal UK Square account for The Skin Den, with identity and bank checks complete. She does **not** need a developer account and never shares her password or bank details.
2. When told it's ready: sign in to the dashboard, tap **Connect Square account**, approve on Square, and check the business and location shown.
3. Take part in one small real test: a £1 link paid with her own card, then refunded in Square. Then confirm the payout reached her bank.

## What Kyle must approve or do
- This spec, the ADR and `tasks/plan.md`.
- Creating the Square application "The Skin Den" (sandbox and production credentials) in his Square developer account, and registering:
  - the redirect URL `https://theskinden.co.uk/admin/`;
  - the webhook URL `https://platform-api-production-3d5f.up.railway.app/v1/square/webhook`.
- Setting the Square variables on the Railway `skin-den-platform` service (names only in docs).
- Each deploy: `platform-api` on Railway and the dashboard on GitHub Pages.
- The live £1 test with Rachel.

## Release gates (reported separately)
1. Code tested.
2. Square application configured (sandbox, then production).
3. Secrets installed.
4. Deployed.
5. Seller consent completed.
6. Real payment processed and refunded.
7. Settlement seen in Rachel's bank.
