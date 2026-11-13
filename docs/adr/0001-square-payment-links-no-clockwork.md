# ADR 0001: Remove Clockwork; take payments with Square payment links from the staff dashboard

- Status: **Accepted 2026-11-13** (Kyle). Replaces an earlier, unadopted draft that would have taken payments through Clockwork's Square checkout. That draft is kept in Kyle's private session notes, not in this repository.
- Date: 2026-11-13

## Context

The Skin Den's online booking ran on Clockwork, a separate booking app. Its Stripe platform account is closed, and Rachel's venue there still required card-on-file payment. As a result, every online booking failed at the last step with "Online payment is not set up for this venue yet".

Two options were considered:
- Making Clockwork's Square checkout production-ready. That needed paid hosting, production Square app setup and a pilot.
- A stopgap that switched Clockwork payment off.

Kyle chose neither. He asked to get rid of Clockwork entirely, take payments off the public site, and give Rachel "a Square payments link set up in the dashboard". He declined an integrated Square connection (OAuth, webhooks, payments recorded in the dashboard).

## Decision

1. **No Clockwork.** The website, the client account and the staff dashboard no longer call or link to Clockwork. Clients book with Rachel on WhatsApp, the booking section's primary action.
2. **No payment flow on the public site or client account.** The in-account booking/deposit screen and the Clockwork appointments list are removed.
3. **Square payment links, made by Rachel.** The staff dashboard shows "Take a payment with Square", with a button that opens `https://app.squareup.com/dashboard/payment-links` in a new tab. This page is linked from Square's UK help: <https://squareup.com/help/gb/en/article/6692-get-started-with-square-checkout-links>. Rachel creates a link for a deposit or treatment in her own Square account, or in the Square app, and sends it to the client. The money goes straight to her Square account.
4. **No integration.** No Square code, OAuth, tokens or webhooks are added to this repo or `platform-api`, so there are no secrets to hold. The dashboard does not record Square payments; Square's own dashboard is the record.

## Consequences

- Rachel needs her own Square account, verified with her bank. She handles links, refunds and payment history in Square.
- Deposits are not enforced automatically. Rachel decides when to ask for one, and her cancellation policy is applied by hand.
- The staff dashboard's old **Payments** tab still shows the `platform-api` Stripe ledger, which no longer receives anything. It was left alone in this change.
- The Skin Den venue still exists inside Clockwork. Its booking page `https://clockwork-bookings.vercel.app/m/the-skin-den/book` is still publicly reachable and still errors if used. Turning it off is a separate Clockwork production change that needs Kyle's approval.
- If online booking with payment is wanted later, it starts as a new decision.

## Alternatives considered

- **Clockwork's Square checkout.** Rejected by Kyle.
- **Integrated Square in the staff dashboard** (Rachel connects her account; the dashboard creates links and marks them paid through signed webhooks). Offered and declined. It is more work, needs production secrets and webhooks, and is not needed for links Rachel makes herself.
