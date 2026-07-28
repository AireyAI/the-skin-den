# The Skin Den — studio admin

Same Kettle Kulture stack: static admin on the client domain + **platform-api** on Railway.

## URLs

| What | URL |
|------|-----|
| Admin (Rachel) | https://theskinden.co.uk/admin/ |
| Platform API | https://platform-api-production-3d5f.up.railway.app |
| Public site | https://theskinden.co.uk/studio.html |

## Stripe Connect

Identical to KK: coach signs in → **Set up payouts** → `POST /v1/admin/stripe/connect-link` → Stripe onboarding → return to `https://theskinden.co.uk/admin/?stripe=return`.

Railway must have:

- `KK_PUBLIC_SITE_ORIGIN=https://theskinden.co.uk`
- `KK_CORS_ORIGINS` including `https://theskinden.co.uk`
- `STRIPE_SECRET_KEY` = platform **sk_live_** (not restricted `rk_`)
- `PLATFORM_FEE_BPS=500` (5%)

## Login

Set `KK_COACH_EMAIL` and `KK_COACH_PASSWORD` on the Skin Den **platform-api** service. Admin uses `POST /v1/auth/coach/login`.

## Code

- Admin UI: `admin/` (copied from Kettle Kulture website admin)
- Site wiring: `site-config.js` → `platformApiUrl`, `publicOrigin`
- Booking embed (public only): `site-config.js` → `booking.clockworkBookUrl`
