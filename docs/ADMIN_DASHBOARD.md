# The Skin Den — studio admin

**Isolated** stack: Skin Den owns its Railway project, volume, JWT, and now its own `platform-api/` in this repo. Do not share with Kettle Kulture or any other client.

## URLs

| What | URL |
|------|-----|
| Admin (Rachel) | https://theskinden.co.uk/admin/ |
| Platform API (Skin Den only) | https://platform-api-production-3d5f.up.railway.app |
| Railway project | `skin-den-platform` |
| Public site | https://theskinden.co.uk/studio.html |
| Client appointments | https://theskinden.co.uk/account/ |
| Clockwork book | https://clockwork-bookings.vercel.app/m/the-skin-den/book |

## Stripe Connect (treatment money)

Payout setup goes through **Clockwork** (not this platform-api’s Connect account for memberships):

1. Sign in at `/admin/`
2. **Set up payouts** → Clockwork `POST /api/m/the-skin-den/connect/link`
3. Return URL: `https://theskinden.co.uk/admin/?stripe=return`

Railway platform-api may still hold a Stripe key for CRM/webhooks; booking deposits settle on Clockwork’s merchant row.

## Login

- Coach: `KK_COACH_EMAIL` / `KK_COACH_PASSWORD` on **skin-den-platform** only
- Admin uses `POST /v1/auth/coach/login` on the Skin Den API URL above

## Isolation checklist

- [x] Own Railway project + volume
- [x] Own GitHub source (`AireyAI/the-skin-den` → `platform-api/`)
- [x] Tenant env (`KK_TENANT_SLUG=the-skin-den`, Rachel email, theskinden.co.uk CORS)
- [ ] Apple Sign In (`APPLE_CLIENT_ID` not set yet)
- [ ] Clockwork production deploy with `PLATFORM_*_THE_SKIN_DEN` (set on Vercel; needs app redeploy)

## Code

- Admin UI: `admin/`
- Platform API: `platform-api/` (this repo)
- Site wiring: `site-config.js` → `platformApiUrl`, `booking.*`
