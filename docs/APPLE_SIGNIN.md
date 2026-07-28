# Sign in with Apple — The Skin Den

## Identifiers created (App Store Connect API)

- App ID: `com.theskinden.app` (Primary)
- Web ID: `com.theskinden.web` (Sign in with Apple enabled)
- Railway: `APPLE_CLIENT_ID=com.theskinden.web`

## Finish in Apple Developer (required for the button to work)

Services IDs for web often need portal domain config that the API does not fully expose:

1. Open [Identifiers](https://developer.apple.com/account/resources/identifiers/list) → **com.theskinden.web**
2. Confirm type is suitable for **Sign in with Apple** (web). If Apple only shows it as App ID, create a **Services ID** `com.theskinden.web` in the Services IDs list (or rename/register), Primary App ID = `com.theskinden.app`.
3. Domains: `theskinden.co.uk`
4. Return URLs (exact):
   - `https://theskinden.co.uk/account/`
5. Download domain association → save as `.well-known/apple-developer-domain-association.txt` and deploy.
6. Redeploy Skin Den site + confirm:
   `curl -s https://platform-api-production-3d5f.up.railway.app/v1/public/config`
