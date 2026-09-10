# Sign in with Apple — The Skin Den

## Current identifiers (App Store Connect)

| ID | Platform | Role |
|----|----------|------|
| `com.theskinden.app` | UNIVERSAL | Primary App ID — Sign in with Apple **enabled** |
| `com.theskinden.web` | UNIVERSAL | **Wrong type** for web SIWA (created as App ID, not Services ID). SIWA capability was removed so it does not steal primary consent. |
| Railway `APPLE_CLIENT_ID` | — | Still `com.theskinden.web` until a real Services ID exists |

App Store Connect API no longer accepts `platform: SERVICES` on `/bundleIds`. **Services IDs must be created in the Apple Developer portal.**

## Finish in Apple Developer (required)

1. Open [Services IDs](https://developer.apple.com/account/resources/identifiers/list/serviceId) (team `8W4NK3AJQN`)
2. Register a Services ID, e.g. `com.theskinden.signin` (preferred) or reclaim naming if you delete the mistaken UNIVERSAL `com.theskinden.web` later
3. Enable **Sign in with Apple** → Configure  
   - Primary App ID: `com.theskinden.app`  
   - Domains: `theskinden.co.uk`  
   - Return URL: `https://theskinden.co.uk/account/`
4. Download domain association if offered → overwrite  
   `.well-known/apple-developer-domain-association.txt` (repo already has a `webcredentials` starter for `8W4NK3AJQN.com.theskinden.app`)
5. Deploy the site so `https://theskinden.co.uk/.well-known/apple-developer-domain-association.txt` returns that file (not a 404 HTML page)
6. Set Railway `APPLE_CLIENT_ID` to the new Services ID identifier
7. Confirm: `curl -s https://platform-api-production-3d5f.up.railway.app/v1/public/config` → `appleSignInEnabled: true` and matching `appleClientId`

## Helper script

```bash
node platform-api/scripts/apple-siwa-setup.mjs
```

Ensures primary SIWA on `com.theskinden.app` and writes the domain association starter. Services ID + domains still need the portal step above.

## Until Services ID is done

Email create/sign-in on `/account/` works. Apple button may fail with `invalid_client` until the Services ID + return URL are live.
