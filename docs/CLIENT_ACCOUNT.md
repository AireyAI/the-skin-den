# Client appointments account (Apple sign-in)

Public URL: **https://theskinden.co.uk/account/**

## How it works

1. **Sign-in** — `platform-api` (`/v1/auth/apple`, email/password) issues a member JWT.
2. **Appointments** — Browser calls Clockwork `GET /api/m/the-skin-den/member/bookings` with that JWT.
3. Clockwork verifies JWT (`PLATFORM_MEMBER_JWT_SECRET` = platform-api `KK_JWT_SECRET`) and loads bookings for the member email.

Book with the **same email** as Apple (or the address on the booking confirmation). Hide My Email relays will not auto-match — Rachel can link manually in admin (unclaimed tab, KK pattern).

## Before go-live

1. **Dedicated platform-api** for Skin Den on Railway (do not share Kettle’s SQLite).
2. Vercel Clockwork env: `PLATFORM_MEMBER_JWT_SECRET`, `PLATFORM_API_URL`, `ADMIN_ALLOWED_ORIGINS` includes `https://theskinden.co.uk`.
3. Apple Developer: Services ID, domain `theskinden.co.uk`, redirect `https://theskinden.co.uk/account/`, `APPLE_CLIENT_ID` on platform-api.
4. Nav link on `studio.html` → `/account/`.

See **clockwork-bookings** `docs/SALON_CLIENT_PLATFORM.md` for the full reusable pipeline.
