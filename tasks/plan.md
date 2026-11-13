# The Skin Den: remove Clockwork, Square payment link in the staff dashboard

Status: **released 2026-11-13 with Kyle's go-ahead** ("Yes, go live"). Built on branch `payments/square-link-no-clockwork` from live `main` at `4a06961`. The earlier Clockwork/Square plan was rejected on 2026-11-13; see `docs/adr/0001-square-payment-links-no-clockwork.md`.

## Done (local)
- **Public site** (`index.html` `#book`): "Check online availability" (Clockwork) and its help line removed. WhatsApp is the only booking action. The policy panel is unchanged.
- **Config** (`site-config.js`): Clockwork `booking` block, Stripe `payments` block and Clockwork `clientAccount.bookingsUrl` removed.
- **Client account** (`account/`, `member-session.js`):
  - The in-account booking/deposit screen is removed (`account/account-book.js` deleted).
  - The Clockwork appointments list is gone. In salon mode the appointments panel is hidden, and the summary reads "To book or change an appointment, message Rachel on WhatsApp."
  - The page title is now "Your account".
- **Staff dashboard** (`admin/`):
  - The Clockwork sign-in and the Stripe "payouts paused / Set up payouts" banner are removed.
  - A new **"Take a payment with Square"** card opens Square's payment-links page in a new tab.
  - The quick link "Booking section (public)" now goes to the site's own `#book`.
  - The tour step and Aria hint now mention Square links. The unused toast helper is removed.

## Evidence
- Removal check: FAIL (19 findings) before the change, PASS after. It looks for no Clockwork or Stripe-payout code in published files and for the Square button. The script is in the session scratchpad.
- `node tasks/checks/site-checks.mjs http://localhost:4327`: **0 failed of 49**, 6 skipped. `/account/` and `/admin/` are skipped there because they are live-only checks.
- Every changed module imports without errors in the browser. The account page's only failed requests go to the local `platform-api` dev port (`localhost:3220`), as before.
- Dashboard card screenshots at 375 and 1280 px: the button is 66 px tall and the link has no underline.

## Left for Kyle
1. Done: merged to `main` and published by GitHub Pages. Rollback: `git revert -m 1 <merge commit>` and push `main`, with Kyle's OK.
2. The held round-2 patch (`tasks/v3-round2-only.patch`) touches the same `#book` area, so it will need a small rebase.
3. Optional, Clockwork production (needs approval): switch off or delete The Skin Den venue so `clockwork-bookings.vercel.app/m/the-skin-den/book` stops taking or failing bookings.
4. Optional: hide the dashboard's old **Payments** tab (the `platform-api` Stripe ledger, now unused).
5. Rachel: create or verify her Square account. She then uses the dashboard button, or the Square app, to make links.
