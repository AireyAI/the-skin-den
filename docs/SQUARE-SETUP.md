# Square for The Skin Den: setup guide (for Kyle)

Rachel connects **her own** Square account to the staff dashboard (theskinden.co.uk/admin). The Skin Den's `platform-api` holds that connection, creates payment links with her token, and marks them Paid only after checking the payment with Square. Design: `docs/specs/2026-11-13--square-connect-dashboard.md` and `docs/adr/0002-square-connect-in-platform-api.md`.

Never paste any secret into chat, Git or the dashboard. Only variable **names** appear here.

## 1. Create the Square application (once)
1. Sign in to the Square Developer Console with your own developer account.
2. Create an application named **The Skin Den**. Don't reuse the Clockwork/Air Bookings app or anything used for Kettle Kulture.
3. **Sandbox → OAuth:** set the redirect URL to exactly `http://localhost:4327/admin/`.
4. **Production → OAuth:** set the redirect URL to exactly `https://theskinden.co.uk/admin/`. This needs a production approval from you.
5. **Production → Webhooks:**
   - Add a subscription at `https://platform-api-production-3d5f.up.railway.app/v1/square/webhook`.
   - API version `2026-09-16`.
   - Events: `payment.created`, `payment.updated`, `refund.created`, `refund.updated` and `oauth.authorization.revoked`.
   - Copy its **signature key**.

## 2. Variables
| Name | Sandbox (local) | Production (Railway `skin-den-platform`, Production scope only) |
|---|---|---|
| `SQUARE_ENVIRONMENT` | `sandbox` | `production` |
| `SQUARE_APPLICATION_ID` | sandbox application ID | production application ID |
| `SQUARE_APPLICATION_SECRET` | sandbox secret | production secret |
| `SQUARE_TOKEN_ENCRYPTION_KEY` | a key you generate | a **different** key you generate. Keep it: losing it means Rachel reconnects |
| `SQUARE_REDIRECT_URI` | `http://localhost:4327/admin/` | `https://theskinden.co.uk/admin/` |
| `SQUARE_WEBHOOK_SIGNATURE_KEY` | any value (webhooks can't reach a laptop) | the subscription's signature key |
| `SQUARE_WEBHOOK_URL` | any https URL | `https://platform-api-production-3d5f.up.railway.app/v1/square/webhook` (must match Square exactly) |

To generate a key, run this yourself and paste the result straight into the env file or Railway:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

The live server refuses to use Square if any variable is missing, if it's set to sandbox, or if a URL isn't https. The dashboard then keeps its plain "Open Square payment links" button.

## 3. Sandbox test on your Mac
Run this from a checkout of the `payments/square-connect` branch. The Square code isn't on `main` yet.

1. Create a **fresh** `platform-api/.env` in that checkout. It is git-ignored. Don't copy an existing one, because it may hold live keys. Put in only:
   - the sandbox variables above;
   - `KK_CORS_ORIGINS=http://localhost:4327`;
   - a local studio-owner email and password (`KK_COACH_EMAIL`, `KK_COACH_PASSWORD`).
2. Start the API: `cd platform-api && npm ci && npm run dev` (port 3220).
3. Start the site: `PORT=4327 node serve.mjs` from the repo root, then open `http://localhost:4327/admin/` and sign in.
4. **Connect Square account:** sign in with a Square **sandbox** test seller, then approve. The card should show the business and location, and "Test mode".
5. **Request a payment** (for example £1), open the link and pay with a Square sandbox test card.
6. **Payments tab:** tap **Check with Square**. The link should show Paid.
7. Refund it in the sandbox Seller Dashboard, then check again. It should show Refunded.
8. **Disconnect.**

## 4. Production release (each step needs your OK)
Railway deploys `platform-api` automatically from GitHub `main`. Merging the branch therefore ships the backend and the dashboard together.

1. Back up the database while signed in (`POST /v1/admin/backups`). Then set the production variables on Railway (Production scope).
2. Confirm:
   - `/health` is OK;
   - `/v1/admin/square/status` returns 401 without sign-in;
   - Square's "Send test event" is accepted.
3. Merge the dashboard to `main` (GitHub Pages).
4. Rachel signs in, taps **Connect Square account**, and checks the business and location shown.
5. **£1 test:**
   - Make a link and pay it with Rachel's own card.
   - It shows Paid. Square shows the payment with no app fee.
   - Refund it in Square; it shows Refunded.
   - After Square's payout window, Rachel confirms the money reached her bank.

## Operating notes
- **Only one Square business can ever connect.** After the first connection, a different Square business is refused. To allow a different one, run this on the server (with the API's `KK_DATA_DIR` and `KK_TENANT_SLUG`):

  ```bash
  node scripts/square-clear-merchant-lock.mjs production
  ```

- **Access renewal and missed webhooks:** access is renewed automatically (daily and when used). Links still waiting are re-checked daily, and Rachel can tap **Check with Square** at any time.
- **If Square access stops working** (removed in Square, or the encryption key changed), the card says **Reconnect Square**.
- **Refunds and payment history** stay in Rachel's Square dashboard.
