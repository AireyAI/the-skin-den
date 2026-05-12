# SPEC — The Skin Den (by Rachel)

> **Purpose**: define WHAT we're shipping before Kyle approves. Build does not start until this is signed off. After approval → 2 hero-only design directions → Kyle picks A or B → full build.
>
> **References:** `client_intake.md` (data), `.specify/memory/constitution.md` (AireyAI rules), `~/CLAUDE.md` (build pipeline).

---

## 1. Goals

| # | Goal | Success metric |
|---|---|---|
| G1 | Convert IG/FB traffic into booked consultations | Site → Fresha booking conversion ≥ 8% |
| G2 | Build trust in a premium-priced (vs high-street salon) practitioner | Time on Services + About pages ≥ 60s avg |
| G3 | Reduce no-show losses via card-on-file at booking | Fresha card-capture rate ≥ 90% of bookings |
| G4 | Position Rachel as the Carlisle authority on acne + advanced skincare | Rank top-3 for "acne specialist Carlisle" within 90 days |
| G5 | Look like a £100/treatment clinic, not a £30 mobile beautician | Pass impeccable:audit with ≥ 4.0 on visual quality dimension |

---

## 2. Site structure

**Single-page with deep linking** (not multi-page). Reasoning: 90% of her audience comes from IG link-in-bio + WhatsApp shares — both deliver to a single URL. A scrolling story converts better than a multi-page maze for service-first businesses at her scale.

Sections in order (with deep-link IDs):

| # | Section | ID | Primary job |
|---|---|---|---|
| 1 | **Hero** | `#top` | One-glance brand statement + primary CTA (Book Consultation) |
| 2 | **Two paths** | `#paths` | Surface the two audiences (Acne vs Advanced Skincare) — each routes deeper |
| 3 | **About Rachel** | `#about` | Credentials, qualifications, photo, story — trust foundation |
| 4 | **Treatments & prices** | `#treatments` | Full menu, grouped (Facials / Advanced / Boosters), with real prices |
| 5 | **Results gallery** | `#results` | Real client before/afters from her FB photos — 8–12 best shots |
| 6 | **Testimonials** | `#reviews` | 3–5 selected IG reviews (with permission), one feature quote |
| 7 | **The studio** | `#studio` | Treatment room photos + premises detail (or "address shared on booking") |
| 8 | **FAQ** | `#faq` | 6–8 real Qs — preparation, downtime, packages, what to expect for new clients |
| 9 | **Booking** | `#book` | Fresha widget embed + cancellation policy excerpt + WhatsApp fallback |
| 10 | **Contact / footer** | `#contact` | Phone, WhatsApp, IG, Threads, address (or appointment-only note), hours |

**Separate `/policy` page** for full cancellation + privacy + terms (legally required, kept off main scroll).

---

## 3. Content (real, from intake — no lorem)

### Hero
- **Headline (working draft):** *"Skin that performs. Not pampering."*
  - Or: *"Advanced skincare. Real results. Carlisle."*
  - Or: *"The Skin Den — Carlisle's results-driven skincare studio."*
  - → Kyle picks at design-direction stage.
- **Subhead:** *"VTCT-qualified acne specialist & advanced skin practitioner. Personalised treatment plans for skin that actually changes."*
- **Primary CTA:** **Book a Consultation** → opens Fresha widget
- **Secondary CTA:** **DM on Instagram** → opens IG DM in new tab
- **Background:** `brand_assets/fb_cover.jpg` (treatment room + logo plaque) with warm taupe gradient overlay

### Two paths
Card-A: **"Struggling with acne or breakouts?"** → scrolls to acne treatments + her acne specialist credentials
Card-B: **"Investing in long-term skin health?"** → scrolls to advanced treatments + boosters

### About Rachel
- Photo placeholder (⚠️ ask Rachel for headshot — selfie acceptable)
- 2-paragraph bio (Kyle to draft, Rachel approves)
- Credentials row: VTCT Qualified • Insured • Carlisle-based • [years trading]

### Treatments & prices
Full 13-treatment list from §3 of `client_intake.md`. Three tabs: **Facials / Advanced / Skin Boosters**.

### Results gallery
8–12 best images from `brand_assets/photos/` (we'll triage out the branded quote cards). Lightbox on click. Discreet caption noting "actual client, with permission" or anonymised.

### Testimonials
3–5 reviews from §6 of intake — pending Rachel's confirmation of permission.

### FAQ (draft, Rachel verifies)
1. *Is consultation included in my first treatment?* — Yes, the New Client option is a combined consultation + advanced facial for £50.
2. *Will there be downtime after a peel/microneedling?* — Depends on strength; typically minor redness 24–48h.
3. *Do you do courses for acne?* — Yes, after consultation if results need stacking.
4. *Can I book without a deposit?* — A £20 deposit secures every booking. Fully refundable up to 48h before.
5. *Do you do skin booster courses?* — Yes, course of 3 advised for optimal results.
6. *Where are you based / is your address public?* — *(depends on Rachel's answer)*
7. *Do you do home visits / mobile?* — *(ask Rachel — likely no)*
8. *What if I'm pregnant or have a skin condition?* — *(ask Rachel — typically: book a consultation first)*

### Booking
- **Primary:** Fresha widget embed (Rachel sets up the account; we embed the iframe)
- **Cancellation policy excerpt** displayed right above the widget — visible, never hidden
- **Fallback:** WhatsApp floating button (07568 602861) for clients who prefer DMs

### Contact / footer
- Phone: 07568 602861
- WhatsApp: same number
- IG: @_theskin_den
- Threads: @_theskin_den
- Email: ⚠️ Rachel to confirm
- Address: 73 Greymoor Way, Carlisle, CA3 0FQ *(or "appointment-only — full address shared on booking confirmation" — Rachel decides)*
- Hours: ⚠️ Rachel to confirm
- Privacy / Terms / Cancellation Policy links → `/policy.html`

---

## 4. Visual direction (locked before build)

**Tokens locked via `tokens.css` before any section markup** (per AireyAI Constitution §VI):

```css
:root {
  /* From real brand assets — derived in intake §5 */
  --color-primary:       #C5A06D;  /* warm taupe (her gold accent) */
  --color-primary-dark:  #8A7148;
  --color-primary-light: #DDC59B;
  --color-accent:        #A8B5A0;  /* sage — optional */
  --color-bg:            #FAF7F2;  /* ivory */
  --color-surface:       #F5EFE6;  /* cream */
  --color-text:          #2A2520;  /* charcoal */
  --color-muted:         #8B8074;
}
```

**Typography:**
- Headings: a serif with high contrast strokes and a distinctive **cut-out S** glyph that echoes her logo (candidate: Fraunces, DM Serif Display, or PP Editorial New — to be confirmed in design-direction stage)
- Body: a clean modern sans (Inter or DM Sans)

**Two design directions to be generated next** (per AireyAI §VI — hard stop until Kyle picks):
1. **Direction A — "Editorial Boutique"**: Heavy serif headlines, generous whitespace, large hero image, off-cream backgrounds, minimal accents. Think Stripe meets Aesop.
2. **Direction B — "Warm Clinical"**: Bolder layout, warm-taupe blocks of colour, more visible typography hierarchy, image-led card system. Think Frank Body meets Notion.

Both built as bare hero-only mocks (~5 min each) → screenshots → Kyle picks → full build.

---

## 5. Features

| Feature | In v1 | Notes |
|---|---|---|
| Mobile-responsive (100dvh, touch ≥44px, iOS safe areas) | ✅ | Constitution §VII |
| AireyAI animation toolkit (GSAP + ScrollTrigger) | ✅ | Constitution §IV — hero `data-split`, CTAs `data-magnetic`, stats `data-counter`, sections `data-reveal` |
| Real photos (no stock, no placeholders) | ✅ | Constitution §I — fb_cover + 123 real photos already downloaded |
| Fresha booking widget embed | ✅ | Conditional on Rachel setting up Fresha — fallback: contact form |
| WhatsApp floating button | ✅ | 07568 602861 — z-index per AireyAI standard |
| Cancellation policy excerpt visible at booking section | ✅ | Required for legal enforceability of cancellation fees |
| `/policy.html` page (full cancellation + privacy + terms) | ✅ | Required |
| OG / Twitter / WhatsApp preview image (1200×630) | ✅ | Constitution §Conversion Mechanics — generate via Nano Banana |
| Microsoft Clarity (heatmaps) | ✅ | Standard per memory `reference_clarity_setup.md` — `client: the_skin_den` tag |
| PostHog analytics | ✅ | EU instance, `client: the_skin_den` tag per memory |
| Aria chatbot embed | ⚠️ Probably YES | Brief calls for lead capture (consultation booking) — see Decision §6 |
| Newsletter signup | ❌ | Not in scope v1 — can add later |
| Blog | ❌ | Not in scope v1 — she's not producing copy regularly |
| Multi-language | ❌ | English only, UK market |
| E-commerce / product sales | ❌ | She doesn't sell retail products via the site — consultation-led only |

---

## 6. Open decisions for Kyle (before SPEC sign-off)

These are the only places I need a direction before we move to design:

### D1 — Booking system
**Recommendation:** Fresha embed. Free for her, handles cancellation fees natively, 10-min setup.
- **A)** Use Fresha (we send Rachel a setup checklist)
- **B)** Contact form + WhatsApp only (simpler, weaker on no-shows)

### D2 — Aria chatbot
**Recommendation:** Yes, embed Aria — facials clients ask similar Qs over and over (downtime, preparation, suitability), and Aria can capture leads after-hours when Rachel's in treatments.
- **A)** Embed Aria (we add it to the site)
- **B)** Skip Aria for v1 (revisit after launch traffic)

### D3 — Address handling
**Recommendation:** Wait for Rachel's answer. Home-based studios usually go with "address shared on booking confirmation" for privacy.
- Park this decision until Rachel replies.

### D4 — Hero headline
Pick one (or propose new) — affects design direction:
- **A)** *"Skin that performs. Not pampering."* (punchy, polarising — wins on Direction B "Warm Clinical")
- **B)** *"Advanced skincare. Real results. Carlisle."* (descriptive, safe — wins on Direction A "Editorial Boutique")
- **C)** *"The Skin Den — Carlisle's results-driven skincare studio."* (formal, longer)

### D5 — Domain
Three obvious candidates. Namecheap check needed before we commit:
- `theskinden.co.uk`
- `theskindenbyrachel.co.uk`
- `theskindenuk.co.uk`

---

## 7. Verification plan (before "done")

Per AireyAI Constitution §Build Verification Gate:

1. ✅ `node serve.mjs` on localhost:3000 (never `file://`)
2. ✅ `node screenshot.mjs http://localhost:3000` — ≥2 desktop + mobile comparison rounds
3. ✅ Playwright MCP — click every CTA, form, nav link, mobile viewport
4. ✅ Lighthouse MCP — Perf ≥90, LCP <2s, CLS <0.1, TBT <200ms
5. ✅ `impeccable:audit` — P0-P3 scored report, **zero P0**
6. ✅ `impeccable:critique` — persona test passes
7. ✅ Metatags.io check — OG preview renders with logo + tagline + cream/taupe colour
8. ✅ Real Fresha widget loads (if D1=A) — test a sandbox booking through to confirmation
9. ✅ Cancellation policy excerpt is visible at booking section AND linked in footer
10. ✅ Zero "AireyAI" mentions anywhere (visible text, alt, meta, comments, JS console, exports)

---

## 8. Out of scope (explicit non-goals)

- E-commerce / retail product sales
- Newsletter signup
- Blog / article system
- Multiple languages
- Mobile-app wrapper (Capacitor)
- Loyalty / referral system (could add later as v2)
- Booking-system-from-scratch (Fresha handles this — we don't rebuild it)

---

## 9. Delivery plan (after Kyle signs off this SPEC)

1. **Design directions** — generate 2 hero-only mocks (Editorial Boutique + Warm Clinical), screenshot, Kyle picks A/B *(~30 min)*
2. **Locked design tokens** — write `tokens.css` from the winning direction *(10 min)*
3. **Build** — full site per §2 structure *(~3–4 hr active work)*
4. **WhatsApp Rachel** — send her the §9 questions checklist + Fresha setup link in parallel
5. **Verify** — run §7 verification pipeline
6. **Pre-launch review** — Kyle approves screenshots before deploy
7. **Deploy** — GitHub Pages (AireyAI org) → Namecheap domain → Cloudflare proxy
8. **Hand-off** — share preview link with Rachel, get her sign-off, swap any placeholder content for her final answers

---

*End of SPEC. Waiting on Kyle's decisions §6 to proceed.*
