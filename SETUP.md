# AireyAI Client Site Template

A fully wired AireyAI client site: hero video, services, about, gallery, reviews, FAQ, booking form, Quick Book popup, admin moderation, intro splash, privacy + terms + 404 + cookie banner + GA4.

Everything connects to the shared Aria backend (`aria-chatbot-production-12d0.up.railway.app`) which handles bookings, reviews, calendar events and emails — one server, every client.

Setup time per new client: **~15–30 min** once you have the content.

---

## 1. Duplicate and rename

```bash
cd ~/AireyAi_projects
cp -r new_client_template <client-slug>        # e.g. harper-hair
cd <client-slug>
rm -rf .git
git init -b main
npm install        # installs puppeteer + tailwindcss locally
```

---

## 2. Customise — in this order

### 2a. Brand tokens (highest priority)

Global search & replace these placeholder strings across **all `.html` and `.js` files**:

| Placeholder | Replace with | Example |
|---|---|---|
| `Your Business Name` | client's trading name | `Harper Hair` |
| `YOUR BUSINESS NAME` | same, uppercase version | `HARPER HAIR` |
| `Your / Brand` | logo split style | `Harper / Hair` |
| `Tagline · Goes · Here` | their short tagline | `Cut · Colour · Confidence` |
| `Owner Full Name` | legal owner name | `Emily Harper` |
| `Owner` | short/first name | `Emily` |
| `owner@example.com` | owner's email | `emily@harperhair.co.uk` |
| `00000 000000` | UK phone (space-separated) | `07123 456789` |
| `440000000000` | E.164 phone for WhatsApp URL | `447123456789` |
| `your_instagram_handle` | IG handle | `harperhair_uk` |
| `yourdomain.co.uk` | final domain | `harperhair.co.uk` |
| `your-slug` | GitHub repo slug | `harper-hair` |
| `yourbusiness` | lowercase brand token used in some IDs | `harperhair` |
| `Your Street Address` | street line | `14 King Street` |
| `Your Street` | street name only | `King Street` |
| `Your City` | city/town | `Carlisle` |
| `PC1 1PC` | postcode | `CA1 1HT` |
| `Landmark Name` | nearby landmark (optional) | `Opposite The Crown` |
| `#EC0A7E` | accent/brand colour | `#D4AF37` |

**Quick way (from project root):**

```bash
# bulk rename across html + js (macOS sed)
for f in *.html admin/*.html *.js; do
  sed -i '' \
    -e 's|Your Business Name|Harper Hair|g' \
    -e 's|YOUR BUSINESS NAME|HARPER HAIR|g' \
    -e 's|Your / Brand|Harper / Hair|g' \
    -e 's|Tagline · Goes · Here|Cut · Colour · Confidence|g' \
    -e 's|Owner Full Name|Emily Harper|g' \
    -e 's|Owner|Emily|g' \
    -e 's|owner@example.com|emily@harperhair.co.uk|g' \
    -e 's|00000 000000|07123 456789|g' \
    -e 's|440000000000|447123456789|g' \
    -e 's|your_instagram_handle|harperhair_uk|g' \
    -e 's|yourdomain.co.uk|harperhair.co.uk|g' \
    -e 's|your-slug|harper-hair|g' \
    -e 's|yourbusiness|harperhair|g' \
    -e 's|Your Street Address|14 King Street|g' \
    -e 's|Your Street|King Street|g' \
    -e 's|Your City|Carlisle|g' \
    -e 's|PC1 1PC|CA1 1HT|g' \
    -e 's|Landmark Name|Opposite The Crown|g' \
    -e 's|#EC0A7E|#D4AF37|g' \
    "$f"
done
```

Run the Tailwind rebuild after a colour change:

```bash
npm run build        # regenerates dist/styles.css with the new accent
```

### 2b. Services (huge impact — hand edit)

Open `index.html` and find the `<!-- SERVICES -->` section. There are 4 `<article class="service-card">` blocks. Edit each:

- Number badge (`01 · 60 Min` → your service's number / duration)
- `<h3>` → service name
- Price in the `<div class="font-display text-5xl…">£X</div>`
- Description paragraph
- 3 tag pills

Do the same in **quickbook.js** — the `SERVICES` array at the top:

```js
const SERVICES = [
  { value: 'Your Service 01', price: 50, duration: 60, label: 'Service 01' },
  …
];
```

Remove services you don't offer, or add more — the booking form + Quick Book popup render directly from these lists.

### 2c. Opening hours

Search for `OPENING_HOURS` (in both `index.html` and `quickbook.js`). Update the `[openH, closeH]` per day.

Days of week: `0 = Sun, 1 = Mon, ..., 6 = Sat`. Set to `null` for closed days.

```js
const OPENING_HOURS = {
  0: null,
  1: [9, 17],   // Mon 9–5
  2: [9, 19],   // Tue 9–7 (late night)
  ...
};
```

### 2d. FAQs (10 questions, hand edit)

Open `index.html`, find `<!-- FAQ -->`. Each `<details class="faq-item">` has a `<summary>` (the question) and a `<p>` (the answer). Swap all 10 for the client's real questions. Delete any that don't apply.

### 2e. Reviews

- **Starter:** `reviews.json` is empty. Leave as is — the grid will show "No reviews yet" and the form still works.
- **If the client has existing Setmore / Google reviews**, scrape them into the same JSON shape:
  ```json
  [
    { "name": "Jane D", "date": "2 months ago", "source": "Setmore", "text": "Great service…" }
  ]
  ```

### 2f. About / Location / Gallery / Hero copy

Hand edit `index.html`:
- **About section**: update Jord's bio paragraph to match the client
- **Location section**: the map iframe uses OpenStreetMap bbox — update lat/long if known, or regenerate from https://www.openstreetmap.org/export
- **Gallery**: swap placehold.co URLs for real images in `images/` folder
- **Hero headline**: the three stacked words (`RECOVER / EVOLVE / PERFORM`) — change for brand

---

## 3. Brand assets

Replace the placehold.co URLs once you have real images:

```
brand_assets/
  logo.jpeg          ← 512×512 client logo
  banner.png         ← optional wide banner
images/
  gallery-1…7.jpeg   ← real client photos
video/
  hero-shoulder.mp4             ← 8-sec ambient hero loop (Veo3)
  hero-shoulder-poster.jpg      ← first frame of the video
  intro-manifesto.mp4           ← 8-sec splash on intro.html (Veo3)
```

See `video/README.md` for Veo3 generation instructions.

---

## 4. Analytics

Open `consent.js`, line 21-ish:

```js
const GA_MEASUREMENT_ID = 'G-XXXXXXXXXX';   // replace with client's GA4 ID
```

Sign in to the client's Google account at https://analytics.google.com, create a new property, grab the `G-XXXXXXXXXX`.

---

## 5. Deploy to GitHub Pages

```bash
npm run build                        # rebuild Tailwind one more time
git add -A
git commit -m "initial site for <Client Name>"
gh repo create AireyAI/<client-slug> --public --source . --remote origin --push
gh api -X POST /repos/AireyAI/<client-slug>/pages -f "source[branch]=main" -f "source[path]=/"
```

Live URL: `https://aireyai.github.io/<client-slug>/`

---

## 6. Wire up Aria

Each new client needs two one-time bits of backend setup on Aria:

### 6a. Whitelist the domain

```bash
# Add GitHub Pages domain now, real domain later
curl -X POST 'https://aria-chatbot-production-12d0.up.railway.app/admin/domains?pass=aria-admin' \
  -H 'Content-Type: application/json' \
  -d '{"domain":"aireyai.github.io"}'

# Once they buy their real domain (e.g. harperhair.co.uk)
curl -X POST 'https://aria-chatbot-production-12d0.up.railway.app/admin/domains?pass=aria-admin' \
  -H 'Content-Type: application/json' \
  -d '{"domain":"harperhair.co.uk"}'
```

`aireyai.github.io` is probably already whitelisted from previous clients — check first:

```bash
curl 'https://aria-chatbot-production-12d0.up.railway.app/admin/domains?pass=aria-admin'
```

### 6b. Per-client admin password for review moderation (optional)

The admin page at `/admin/reviews.html` authenticates against:

1. `REVIEWS_ADMIN_PASS_<slug>` (per-client, preferred)
2. `REVIEWS_ADMIN_PASS` (your global master — works on every client's admin page)
3. `aria-admin` (default fallback)

Set a per-client password in Railway env vars:

```
REVIEWS_ADMIN_PASS_harperhair = <strong random string>
```

Then update the `ADMIN_PASSWORD` constant at the top of `admin/reviews.html` to match.

### 6c. Optional: connect Google Calendar

The client visits `https://aria-chatbot-production-12d0.up.railway.app/connect/gmail` and signs in with their Google account. From then on, every booking auto-creates a calendar event. If they're Outlook-only and don't want Google, the `.ics` attachment on the booking email gives them a one-tap add-to-calendar in Outlook instead.

---

## 7. Final checks

- [ ] All placeholder strings replaced (grep for `Your`, `yourdomain`, `your-slug`, `#EC0A7E` — anything remaining?)
- [ ] `npm run build` ran after colour/brand changes
- [ ] All images swapped (no `placehold.co` URLs left in the live site)
- [ ] Booking form end-to-end: submit a test → client gets confirmation → owner gets alert
- [ ] Review form end-to-end: submit a test → appears in `/admin/reviews.html` → approve → appears on `/reviews.html`
- [ ] GA4 tracking working (Real-Time tab in GA dashboard)
- [ ] Lighthouse pass on desktop + mobile (target: 90+ on Perf, 100 on A11y & SEO)
- [ ] `privacy.html` and `terms.html` reviewed by the client
- [ ] Cancellation policy accurate on `terms.html`

---

## File structure cheatsheet

```
.
├── index.html              ← homepage (hero, services, about, gallery, reviews teaser, FAQ, booking, location)
├── reviews.html            ← dedicated page showing all reviews + leave-a-review form
├── intro.html              ← 8-sec splash played on first visit of a session
├── privacy.html            ← UK GDPR privacy policy
├── terms.html              ← terms + cancellation policy
├── 404.html                ← branded not-found
├── admin/
│   └── reviews.html        ← password-gated moderation dashboard
├── quickbook.js            ← floating FAB + modal booking popup
├── consent.js              ← cookie banner + GA4 loader
├── animations.js           ← GSAP scroll reveals + parallax + counters
├── serve.mjs               ← local dev server (npm run serve → http://localhost:3000)
├── screenshot.mjs          ← puppeteer full-page capture
├── tailwind.config.js      ← brand tokens & content paths
├── src/input.css           ← Tailwind @base/@components/@utilities directives
├── dist/styles.css         ← compiled, committed (21 KB minified)
├── package.json
├── reviews.json            ← static imported reviews (empty by default)
├── video/                  ← per-client Veo3 videos (see video/README.md)
├── brand_assets/           ← logo + banner
└── images/                 ← gallery photos
```

## Useful commands

```bash
npm run serve     # http://localhost:3000
npm run build     # compile Tailwind to dist/styles.css
npm run watch     # auto-rebuild on HTML/JS change (run during dev)
```

---

Built with the AireyAI stack. Questions → Kyle.
