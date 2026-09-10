# The Skin Den — Working Context

> Snapshot gathered 2026-08-21. This is a navigation handoff, not a replacement for the source files. Verify live code and deployment state before making changes.

## Repository

- Local root: `/Users/kyleairey/AireyAi_projects/the-skin-den`
- Remote: `https://github.com/AireyAI/the-skin-den.git`
- Branch: `main`
- `HEAD`: `19d0db6` — client account hub with Apple-first sign-in and in-account booking
- `HEAD` matches `origin/main` (`0` ahead / `0` behind)
- One repository only; no nested Git repository or submodule
- The project is already present in `/Users/kyleairey/.codex/project-index.md`

## Product

The Skin Den by Rachel is a Carlisle, Cumbria advanced-skincare and acne-specialist studio. The product position is premium, warm, personalised skincare — every appointment is tailored to the client — using real treatment-room and client-result photography rather than stock imagery.

Primary audiences:

- People seeking acne support and targeted treatment plans.
- People investing in advanced skin health, texture, tone, hydration, or early ageing support.

Primary conversion is consultation booking, not retail or à-la-carte product sales.

## Public site

- Static HTML/CSS/JS site: `index.html`, `studio.html`, `faq.html`, `policy.html`, `404.html`
- Public origin: `https://theskinden.co.uk`
- Main deep-link sections: `#top`, `#clinic`, `#paths`, `#about`, `#treatments`, `#before-afters`, `#book`, `#reviews`; FAQ is standalone at `faq.html`
- Booking page: `https://clockwork-bookings.vercel.app/m/the-skin-den/book`
- Contact: `rachel@theskinden.co.uk`, `+44 7568 602861`, WhatsApp `https://wa.me/447568602861`
- Venue data: 73 Greymoor Way, Carlisle, CA3 0FQ; visible public copy shows Carlisle, Cumbria · CA3 and shares the full address on booking. The BeautySalon structured data still contains the full address for now.
- Build pipeline: Tailwind input `src/input.css` → generated `dist/styles.css`
- Root scripts: `npm run build`, `npm run screenshot`, `npm run serve`, `npm run watch`

Design constraints are encoded in `tokens.css` and `.specify/memory/constitution.md`: warm taupe/cream/charcoal palette, serif display + sans body, real assets, 44px touch targets, iOS safe areas, WCAG AA contrast, muted autoplay video, no AireyAI white-label leaks, and the performance budget LCP <2s / CLS <0.1 / TBT <200ms / Lighthouse ≥90.

## Client facts

Rachel supplied the replacement treatment menu and prices on 10 September 2026. The public menu now contains 17 treatments across consultations/bespoke facials, advanced skin treatments, skin boosters, and polynucleotides:

- Skin Consultation & Advanced Facial £60
- Advanced Facial £50
- Advanced Facial & Dermaplaning £60
- Acne Consultation & Treatment £70
- Leave It Up To Rachel — Treatment Dependent
- Fusion Facial with Electroporation £60
- Microneedling £80
- Microneedling × Polynucleotides £115
- Chemical Peel £65
- BioRePeel £70
- BioRePeel × Dermaplaning £80
- Hydradermabrasion Facial £55
- Seventy Hyal £100
- Revs Pro 32 £135
- Ejal 40 £140
- Profhilo £200
- Vitaran Eyes £120

Skin booster course recommendations may be advised for optimal results. All injectable treatments are subject to consultation and suitability assessment.

The current public cancellation policy is: 48+ hours free; within 48 hours, 50% of the treatment fee; within 24 hours/no-show, 100% of the treatment fee. Public marketing and policy copy does not claim that Rachel takes deposits. Existing account/admin payment-state code still contains the separate paused-payment workstream and should not be changed casually.

Still needing Rachel’s confirmation: surname/credit, public contact email, opening hours, final clinic media, before/after assets, Clockwork service IDs, additional testimonial permissions, and final booking/domain choices. The treatment list and prices are now confirmed and reflected in the public menu. The supplied Rachel portrait is live at `brand_assets/photos/rachel.jpg`.

## Account and admin architecture

### Client account

- Front end: `account/`
- URL: `https://theskinden.co.uk/account/`
- Email/password sign-in works through the Skin Den API.
- Apple sign-in is intended to issue the same member JWT, but the web Services ID setup is not complete.
- Bookings use the same email identity through Clockwork; Apple Hide My Email relays will not automatically match an existing booking email.
- In-account treatment selection and booking are gated behind `paymentReady`.

### Studio admin

- Front end: `admin/`
- URL: `https://theskinden.co.uk/admin/`
- Areas include clients, bookings/schedule, treatment catalog reference, ledger/revenue, check-in, onboarding, analytics, and Aria copilot.
- The Skin Den admin is being restyled to match the public ivory/cream/wood/gold brand rather than the inherited dark gym desk.
- `admin/js/treatment-catalog.js` is the readable treatment-name/price mapping for admin labels.

### Platform API

- Source: `platform-api/`
- Railway project: `skin-den-platform`
- Public API: `https://platform-api-production-3d5f.up.railway.app`
- SQLite data volume is Skin Den-only; do not share this API, JWT, volume, or tenant env with Kettle Kulture.
- Package scripts: `npm run dev`, `npm run seed`, `npm start`, `npm test`
- Modules cover auth, member/account, bookings and capacity, rescheduling, check-in tokens, schedule, admin routes, Stripe/webhooks, Apple/Google Wallet, backups, rate limits, and tenant/public config.
- Existing test suite: 17 Node tests covering auth, booking capacity/reschedule, check-in, payments, schedule instances, and regressions.

## Payments and Apple status

- `SITE_CONFIG.payments.stripeConnectEnabled` is currently `false`.
- The Clockwork Stripe platform account is closed; online card/Apple Pay deposits and Stripe Express payouts are paused.
- The admin must not invite Rachel to set up payouts until a replacement provider is chosen and wired.
- Current client fallback is WhatsApp/bank transfer; account booking is intentionally gated while `paymentReady` is false.
- Apple Pay support is prepared in the Stripe Payment Element, but it cannot be treated as live while payments are disabled.
- Apple web sign-in still needs a real Services ID created/configured in Apple Developer, with `theskinden.co.uk` and `https://theskinden.co.uk/account/` as the domain/return URL, then `APPLE_CLIENT_ID` set on Railway.
- `.well-known/apple-developer-domain-association.txt` and `platform-api/scripts/apple-siwa-setup.mjs` are present as in-progress setup artifacts; the portal configuration and live verification remain outstanding.

## Current working tree (preserve)

The tree was already dirty before this context snapshot. Do not reset, checkout, or overwrite these changes:

Modified:

- `account/account-book.js`
- `admin/admin-tokens.css`
- `admin/index.html`
- `admin/js/api.js`
- `admin/js/app.js`
- `admin/js/aria-admin.js`
- `admin/js/ledger.js`
- `admin/js/onboarding.js`
- `admin/js/schedule-panel.js`
- `admin/js/site-strip.js`
- `docs/APPLE_SIGNIN.md`
- `docs/RACHEL_ADMIN_LOGIN.md`
- `site-config.js`

Untracked implementation files:

- `.well-known/apple-developer-domain-association.txt`
- `admin/js/treatment-catalog.js`
- `admin/skin-den-desk.css`
- `docs/APPLE_PAY.md`
- `platform-api/scripts/apple-siwa-setup.mjs`

The current diff is primarily the Apple/payment pause, client-facing terminology, admin salon theming, treatment catalog, and Apple web setup workstream. `git diff --check` currently reports trailing whitespace in the two changed Apple/Rachel docs; that was left untouched so the existing work remains intact.

Local-only credentials and provisioning material exists but is ignored; never copy its contents into chat or commit it. Relevant paths include `.admin-coach-password.local`, `.clockwork-bootstrap-secret.local`, and ignored `platform-api` wallet/Google provisioning files.

## Verification already run

- `platform-api`: 17/17 tests pass using a temporary `KK_DATA_DIR`.
- Tailwind build succeeds to a temporary output file; the installed Browserslist database is stale but not blocking.
- Node syntax checks pass for the changed account/admin/Apple JavaScript files.
- Static smoke checks return 200 for `/`, `/studio.html`, `/policy.html`, `/account/index.html`, `/admin/index.html`, and the Apple association file. The local `serve.mjs` helper does not rewrite `/account/` or `/admin/` directory URLs to their index files, so those two slash routes return 404 locally even though the index files exist.
- No live deploy, DNS change, Apple Developer mutation, payment-provider action, or external message was performed.

## Safe working commands

```bash
cd /Users/kyleairey/AireyAi_projects/the-skin-den
npm run build
npm run screenshot
npm run serve

cd platform-api
KK_DATA_DIR=/tmp/skin-den-api-test KK_TENANT_SLUG=the-skin-den npm test
```

Before any deployment or external integration change, re-check the relevant docs in `docs/`, confirm the current diff, and stop at the human approval boundary.

## Incoming work

Paste new tasks into the active conversation. Classify each task against the boundaries above before editing; keep unrelated work separate and preserve the dirty Apple/account/admin workstream until it is explicitly reviewed or committed.

## Client revision received 2026-08-21

The client supplied a full public-site content and information-architecture revision in the attached message. The public treatment catalogue and prices were subsequently supplied on 2026-09-10 and are now reflected in the site and admin reference; booking IDs and replacement photography/video remain separate release items.

Implemented in the public site:

- Hero now leads with “Every appointment, tailored to you.” and the requested personalised-treatment paragraph/metadata; the estimate badge and public Instagram metric are gone.
- Added a `#clinic` section for private one-to-one appointments in Carlisle. Existing clinic media is a temporary fallback with TODOs until the client supplies final media.
- Replaced the paths/cards and removed the Why The Skin Den, skin concerns, Skin Matcher, Instagram feed, duplicate studio, and Results navigation content.
- Treatments now lead with “Treatments that work around you”, the requested treatment-menu intro, the three requested tabs, no Regenerative/Strongest labels, and the skin-booster course note only inside Skin Boosters. Public deposit copy has been removed.
- Before/afters are now a homepage section titled “Real skin. Real results.”; existing real assets remain temporary until supplied before/after assets arrive.
- Replaced Meet Rachel copy with the client-provided text and CTA, and simplified reviews to “In their words / Client reviews”.
- Moved the requested six-question FAQ to standalone `faq.html` so the homepage can end with reviews while FAQ remains a navigation destination.
- Replaced the visible booking policy content with the client-supplied cancellation, rescheduling, late-arrival, suitability, guest, and under-18 wording. Privacy/terms anchors remain below it so cookie/footer links do not break; their payment wording is deposit-neutral.

Pending client inputs:

- New treatment names, prices, descriptions, and any category changes. Current cards/prices are legacy data and must be replaced when the new list arrives.
- Clockwork service IDs/booking URLs for each treatment. Cards are deliberately not made “direct booking” links yet because the current public page has no service mapping and guessing could send clients to the wrong option. Wire each card once the new list and IDs are supplied.
- Final clinic video/photo and before/after assets. Rachel’s supplied portrait is now live at `brand_assets/photos/rachel.jpg` in the Meet Rachel section.
- Any additional approved reviews and the preferred attribution format.

Relevant files for the revision: `studio.html`, `index.html`, `faq.html`, `policy.html`, and this handoff file. Do not reset the pre-existing account/admin/payment changes listed above.
