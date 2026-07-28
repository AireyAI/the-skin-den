# Rachel — studio admin (handoff for Kyle)

**Do not commit passwords.** Kyle keeps the live password in `.admin-coach-password.local` (gitignored).

## Links (send these to Rachel)

| What | URL |
|------|-----|
| **Studio admin** (sign in, bookings, Stripe) | **https://theskinden.co.uk/admin/** |
| Public website | https://theskinden.co.uk/studio.html |
| Public booking page | https://clockwork-bookings.vercel.app/m/the-skin-den/book |

## Sign in

- **Email:** `rachel@theskinden.co.uk`
- **Password:** *(Kyle — see `.admin-coach-password.local` or your password manager)*

## Connect Stripe Express (same as Kettle Kulture)

1. Open **https://theskinden.co.uk/admin/**
2. Sign in with the email and password above.
3. Tap **Set up payouts** on the yellow banner (top of the dashboard).
4. Complete Stripe’s form (bank + ID, ~5 minutes).
5. You land back on **theskinden.co.uk/admin** — when the banner clears, online deposits are live (**95% to you / 5% platform**).

No separate Clockwork URL — everything is inside her admin on **theskinden.co.uk**.

## If something fails

- Hard refresh (Cmd+Shift+R) after a site update.
- Booking/payout API health: https://clockwork-bookings.vercel.app/api/health  
- Studio dashboard API: https://platform-api-production-3d5f.up.railway.app/health  
