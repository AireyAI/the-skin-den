# Client appointments account (Apple sign-in)

Public URL: **https://theskinden.co.uk/account/**

## Isolation

Skin Den uses **its own** platform-api:

- Railway: `skin-den-platform` → `https://platform-api-production-3d5f.up.railway.app`
- Code: `platform-api/` in this repo (`AireyAI/the-skin-den`)
- JWT / SQLite volume: Skin Den only (not Kettle Kulture)

Kettle Kulture lives on a different Railway project (`kettle-kulture-platform` → `…-8a3b.up.railway.app`).

## How it works

1. **Sign-in** — Skin Den platform-api (`/v1/auth/apple`, email/password) issues a member JWT.
2. **Appointments** — Browser calls Clockwork `GET /api/m/the-skin-den/member/bookings` with that JWT.
3. Clockwork verifies with `PLATFORM_MEMBER_JWT_SECRET_THE_SKIN_DEN` and resolves email via `PLATFORM_API_URL_THE_SKIN_DEN`.

Book with the **same email** as Apple (or the address on the booking confirmation). Hide My Email relays will not auto-match.

## Before go-live (remaining)

1. Apple Developer: Services ID, domain `theskinden.co.uk`, redirect `https://theskinden.co.uk/account/`, set `APPLE_CLIENT_ID` on skin-den-platform.
2. Nav link on `studio.html` → `/account/` (if not already live).
3. Smoke: book test guest → sign in → see date/time.

See Clockwork `docs/SALON_CLIENT_PLATFORM.md` for the reusable pipeline.
