# Rachel — studio admin login (The Skin Den)

**Send this to Rachel** after Kyle sets her password on the platform API (today).

## Studio dashboard (same flow as Kettle Kulture)

- **URL:** https://theskinden.co.uk/admin/
- **Email:** `rachel@theskinden.co.uk`
- **Password:** *(Kyle sets this on Railway `KK_COACH_PASSWORD` — not stored in git)*

## Stripe payouts (one click, in the dashboard)

1. Sign in at **https://theskinden.co.uk/admin/**
2. Tap **Set up payouts** on the banner (or open **Payments**).
3. Stripe opens in the browser; add bank details and ID (~5 minutes).
4. You return to **theskinden.co.uk/admin** automatically. When setup is complete, the banner clears and treatment payments are live (**95% to Rachel / 5% platform**).

The dashboard connects the **same Stripe account the booking system pays into**, so
the account she onboards is always the account that receives her money. Payout setup
is only ever done from this dashboard.

If sign-in fails after a deploy, hard-refresh. API health: `https://platform-api-production-3d5f.up.railway.app/health`
