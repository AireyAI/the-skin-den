# The Skin Den: dashboard clean-up, then Square connected to the staff dashboard

Status: **awaiting Kyle's approval.** Spec: `docs/specs/2026-11-13--square-connect-dashboard.md` · ADR: `docs/adr/0002-square-connect-in-platform-api.md`. The previous plan (remove Clockwork) was released as merge `2da2586`.

## Working rules
- **Where:** worktree `.claude/worktrees/nice-mahavira-1e361e`. Never touch the main checkout, which holds Kyle's uncommitted work.
- **Approvals:** no commit, push, deploy, Square account change, Railway variable change or real payment without Kyle's OK in chat.
- **Secrets:** never read or printed. Only variable names appear in docs.
- **Tests:** new behaviour is test-first (red → green), with Square mocked. Real Square calls happen only in sandbox, or in the approved live £1 test.

## S0: Dashboard clean-up (built; awaiting go-live)
Branch `admin/remove-unused`.
- **Removed:**
  - the Bookings, Treatments and old Payments tabs;
  - the booking-fee and old revenue figures, and the old activity row;
  - the treatment slot editor (`admin/js/schedule-panel.js`) and its API helpers;
  - the Guide opening by itself.
- **Overview** now shows the number of clients, plus failed payments if there are any.
- **Checked:** at 375 and 1280, no sideways scroll, the Guide runs 6 steps, and the changed modules load without errors.
- **Go live:** merge to `main`. Then run `node tasks/checks/site-checks.mjs https://theskinden.co.uk` from the main checkout.

## S1: Square application (Kyle)
1. In Kyle's Square developer account, create the application **"The Skin Den"**.
2. Register the sandbox redirect URL `http://localhost:4327/admin/`.
3. Put the sandbox app ID and secret in the local `platform-api` env file. Kyle does this; I never read it.
4. Before S6, register the production redirect URL `https://theskinden.co.uk/admin/`.
5. Before S6, register the production webhook `https://platform-api-production-3d5f.up.railway.app/v1/square/webhook` with the events `payment.created`, `payment.updated`, `refund.created`, `refund.updated` and `oauth.authorization.revoked`.

## S2: Backend connection (`platform-api`)
**Files**
- `src/square-config.mjs`. Environment variables:
  - `SQUARE_ENVIRONMENT`
  - `SQUARE_APPLICATION_ID`
  - `SQUARE_APPLICATION_SECRET`
  - `SQUARE_TOKEN_ENCRYPTION_KEY`
  - `SQUARE_REDIRECT_URI`
  - `SQUARE_WEBHOOK_SIGNATURE_KEY`
  - `SQUARE_WEBHOOK_URL`
- `src/square-crypto.mjs`: AES-256-GCM with associated data `appId:env:merchantId`.
- `src/square-oauth.mjs`: start, complete, status, disconnect, renewal and merchant lock.
- `db.mjs` tables: `square_connection` (single row), `square_oauth_states` and `square_merchant_lock`.
- Routes in `server.mjs`:
  - `POST /v1/admin/square/connect`
  - `POST /v1/admin/square/complete`
  - `GET /v1/admin/square/status`
  - `POST /v1/admin/square/disconnect`
- A renewal timer in the `backup.mjs` pattern: it runs at boot and then every 24 hours.
- An operator script, `scripts/square-clear-merchant-lock.mjs`, for Kyle only.

**Tests:** `test/square-oauth.test.mjs` must show each of these:
- state ownership through the token `jti`;
- state expiry and replay;
- a stale sign-in is refused at start and at disconnect, but allowed at completion;
- wrong app, scopes or merchant;
- a non-GB merchant;
- no GBP location with card processing, or more than one;
- a silent replacement is refused;
- the merchant lock;
- an encryption round trip and an associated-data mismatch;
- a lost key gives "reconnect";
- a refresh race against a disconnect;
- revoke on disconnect;
- the revoked webhook clears the connection.

**Checks:** `cd platform-api && KK_DATA_DIR=<temp> KK_TENANT_SLUG=the-skin-den npm test`. The existing tests also stay green.

## S3: Backend payment links and webhook
**Files**
- `src/square-payments.mjs`.
- Table `square_payment_links`: id, client id/name, description, amount in pence, Square link/order/payment IDs, URL, status, timestamps.
- Routes:
  - `POST /v1/admin/square/payment-links` (£1–£2,000, GBP, 1–120 characters; idempotency key and `reference_id` are the record ID; https Square host only; tipping off)
  - `GET /v1/admin/square/payment-links`
  - `POST /v1/admin/square/payment-links/:id/check`
- `POST /v1/square/webhook`:
  - raw body;
  - HMAC over the configured URL plus the body, constant-time compare;
  - fetch and verify the payment **before** recording the event in one transaction;
  - 5xx on temporary failure.
- The daily job also checks Waiting links.

**Tests:** `test/square-payments.test.mjs` must show each of these:
- server-side validation;
- the seller token and location are used;
- a retry reuses the same link;
- a bad, missing or wrong-URL signature is rejected;
- only a verified COMPLETED payment matching merchant, location, order, GBP and amount marks a link Paid;
- a duplicate event has no effect;
- a failed fetch returns 5xx and is not recorded;
- refund and partial refund;
- Check with Square;
- a success-page visit is never proof of payment.

## S4: Dashboard
**`admin/index.html`**
- `<meta name="referrer" content="no-referrer">`, and a first inline script that removes `code` and `state` from the address.
- The Square card's states:
  - not set up;
  - Connect (with "sign in again" when needed);
  - connecting;
  - connected (business, location, live/test, Disconnect);
  - needs reconnect;
  - errors.
- The plain "Open Square payment links" button stays as a fallback.

**Other dashboard changes**
- **New request form:** client picker or name, description and amount. The result offers **Copy link** and **Send on WhatsApp**.
- **Payments tab returns as Square payments:** status labels (Waiting, Paid, Refunded, Partly refunded) and Check with Square.
- **Overview:** "Paid with Square (30 days)".
- **jsQR:** integrity hash, or hosted in the repo.
- **Pure helpers:** `admin/js/square-ui.mjs` (amount parsing, status labels, return-URL scrubbing), tested with `node --test`.
- **Browser checks:** 375 / 768 / 1280, keyboard and focus, contrast, reduced motion, no console errors.

## S5: Sandbox end to end (local)
1. Kyle's sandbox credentials are in the local env.
2. Run `platform-api` locally and the dashboard at `localhost:4327`.
3. Connect a sandbox seller.
4. Create a link and pay it with a Square sandbox test card.
5. Check with Square shows Paid.
6. Refund in the sandbox dashboard and confirm it shows Refunded.
7. Disconnect, and confirm revocation works.

Webhooks are proven by the S3 tests. No real money.

## S6: Production release (Kyle approves each step)
1. Run `code-reviewer` and `security-auditor` on the diff, then `release-check`.
2. Set the Square variables on the Railway `skin-den-platform` service, Production only. Confirm `KK_CORS_ORIGINS` includes `https://theskinden.co.uk`.
3. Deploy `platform-api` on Railway. Check `/health` and that the Square status route returns 401 without sign-in.
4. Send Square's "send test event" to the webhook and confirm the signature is accepted.
5. Merge the dashboard to `main` (GitHub Pages) and run the live site checks.

## S7: Rachel connects; first real payment
1. Rachel signs in on her phone and laptop and connects Square. Confirm her business and location.
2. Make a £1 link and pay it with her own card. Confirm the webhook marks it Paid exactly once and the payment shows in her Square account with no app fee.
3. Refund it in Square and confirm it shows Refunded.
4. Test from her iPhone home-screen shortcut if she uses one.
5. After Square's payout window, Rachel confirms the payout reached her bank.

## S8: Docs and memory
Update `docs/PROJECT_CONTEXT.md` and `docs/APPLE_PAY.md` (payments), add a short `docs/SQUARE-SETUP.md` (variable names, URLs, operator lock script), and update project memory.

## Release gates (reported separately)
| Gate | Evidence |
|---|---|
| Code tested | Test output from `platform-api` and the dashboard helpers |
| Square application configured | Saved redirect and webhook settings (sandbox, production) |
| Secrets installed | Railway variable names present; status route works |
| Deployed | Railway deployment ID; Pages commit; live site checks |
| Seller consent | Rachel's business and location shown in the dashboard |
| Real payment verified | £1 link Paid → Refunded; Square shows the payment, no app fee |
| Settlement verified | Rachel confirms the payout in her bank |
