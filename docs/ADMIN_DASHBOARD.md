# Studio admin dashboard (The Skin Den)

Coach UI lives at `/admin/` on the marketing site (`noindex`). Same stack as Kettle Kulture: platform-api + Aria copilot sidebar.

## Local

1. Start `platform-api` on port **3220** (Skin Den tenant env when deployed).
2. `node serve.mjs` on port **3000**.
3. Open http://localhost:3000/admin/ and sign in with coach credentials from `platform-api/.env`.

On localhost, `platform-client.js` sets:

- `KK_PLATFORM_API` → `http://localhost:3220`
- `KK_ADMIN_API_BASE` → `http://localhost:3220/v1/admin`

If the API is not running locally, the dashboard loads **demo data** from `admin/data/members.demo.json` so Rachel can tour the UI.

## Quick links

- **Review moderation (legacy):** `/admin/reviews.html`
- **Clockwork booking admin:** configured in `site-config.js` → `booking.clockworkAdminUrl`

## Production

Set `platformApiUrl` in `site-config.js` to the deployed Skin Den platform-api URL when live.
