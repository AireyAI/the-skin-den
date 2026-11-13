# The Skin Den: redesign prompt (v2 "The Den")

Written 2026-11-10 by the build session, for itself, at Kyle's request. This is the brief the redesign is built and judged against.

## Role

You are the design lead and the engineer. Redesign theskinden.co.uk so that a skincare client lands on it and feels they have stepped into Rachel's treatment room, and so that a design jury would stop on it. You have permission to change layout, components, motion and structure freely.

## What must not change

- **Colour scheme.** The tokens in `tokens.css`: ivory `#FDF8EE`, cream `#F5EBDA`, wood `#D4B896`, gold `#C5A06D`, charcoal `#2A2117` and their existing tints. `tokens.css` is shared with `/account` and `/admin`, so additions only.
- **Logo.** Rachel's real wordmark and round plaque. Use the vector traced from her own logo artwork (`brand_assets/logo.svg`), not a typeset imitation. The trace is clean up to about 340px wide; never show it larger.
- **Branding and voice.** Fraunces and Inter. Premium, warm, refined. A luxury skin clinic: not a pink spa, not clinical white. White-label: no agency credit anywhere.
- **Words, prices, policy.** Every treatment name, price, description, review, FAQ answer and policy line stays exactly as approved (current `index.html`, `faq.html`, `policy.html`, checked against `client_intake.md`). Never invent a claim, statistic, review or credential.
- **Plumbing.** Booking routes (WhatsApp, the Clockwork link), phone, socials, `/account/` links, every existing `id` anchor (`#top #clinic #paths #about #treatments #before-afters #acne #panel-* #reviews #book`), page titles, meta, canonical, JSON-LD, the cookie note, static HTML/CSS/JS with no new dependencies.
- **Approvals.** No commit, push, deploy or spend. GitHub Pages serves `main`, so a push is a deploy.

## What you have to work with

- Two good photographs: the treatment room (942×1660: panelled wall, plaque, ring light, steam) and Rachel's portrait (1024×1536). Everything else is 414px client-result thumbnails. Use only photos already live on the site. Never upscale a thumbnail past about 320px. The two AI video loops in `brand_assets/video` do not show her real room: do not use them.
- So the site cannot win on photography. It has to win on type, material, light and motion.

## The idea: the page is the room

Rachel's room has four things no other skin site has: a cream tongue-and-groove wall, a round plaque, a ring light, and steam. Build the site out of those four and nothing else.

- **The wall.** The hero is her panelled wall, rendered live: grooves that catch a light, in the brand's own wood-to-cream tones.
- **The lamp.** A soft ring of light moves across the wall with the pointer (and drifts on its own on phones). It is what a skin specialist does: bring the light close and look. This is the one signature moment. Spend the boldness here and keep everything else quiet.
- **The plaque.** Her real logo hangs on the wall, with a shadow and a gloss that answer the lamp.
- **Steam.** Slow, warm, behind the words. Never in front of text.
- **Boards.** The two real photographs stand tall and narrow in a thin mount, like boards of the wall. (Arched frames were tried on paper and dropped: an arch would cut into the plaque in the room photograph.)

## Page plan (index)

1. **Hero, the wall.** Stepped three-line headline (the approved H1), one line of support, one primary action, one text link, the three credentials. Plaque bottom-right on desktop; top-left on a phone, where it stands in for the nav logo. One message, one action in the first screen.
2. **"Every treatment starts with your skin."** The philosophy, stated once, large. The room photograph, tall, in a mount. Words come into focus as you scroll to them.
3. **Meet Rachel.** Her portrait in a mount, her own words in the first person, and a direct link to the acne treatment.
4. **Treatments.** Charcoal band. A printed-menu price list: four categories, names in serif, prices in lining figures, one line each. Category index stays in reach (side column on desktop, sticky strip on a phone). Acne before-and-afters stay attached to the acne treatment, opening in the lightbox.
5. **Client reviews.** The three real reviews as large pull-quotes with hanging quotation marks. No stars, no carousel.
6. **Book a consultation.** Back on the wall. WhatsApp first, online availability second, the three cancellation tiers, plain.
7. **Footer.** Charcoal, the plaque, contact and information.

`faq.html`, `policy.html` and `404.html` take the same system: real wordmark, same type, same footer. Their text does not change.

## Design system

- **Type.** Fraunces light (opsz at maximum) for display, tight tracking, large. Inter for reading and controls. No all-caps tracked labels except the plaque's own "by Rachel". No middle-dot strings as decoration. Tabular lining numerals for prices. `text-wrap: balance` on headings.
- **Colour roles.** Wall (wood to cream) for hero and booking. Ivory and cream for reading. Charcoal for the menu and footer. Gold for hairlines, markers and focus on dark only; gold never carries small text on the wall (it fails contrast there).
- **Shape.** Circle (plaque, lamp, result thumbnails) and tall rectangle (photographs). Pills for controls. Hairlines, not boxes; no card grids.
- **Space.** One section rhythm, generous. One container width.

## Motion

- One orchestrated moment: on load the lamp comes up, the plaque settles, the headline comes into focus line by line. The headline is on screen from the first frame (it is the page's largest paint, so nothing later, such as the cookie note, is measured in its place) and only sharpens. Done inside about 1.3s.
- One motion language throughout: things come into focus, as under the lamp. Scroll: the words in section 2, a slight lens pull on the two photographs. Native scroll, no hijacking.
- Everything else only answers the visitor: tabs, lightbox, drawer, buttons.
- Reduced motion: no canvas animation, no parallax, no entrances; a still, lit wall. Reduced transparency: glass becomes solid.

## Engineering

- WebGL1 fragment shader on one quad for the wall (`wall.js`), no library. Capped pixel ratio, paused when off-screen or the tab is hidden, drops resolution if frames run long. A CSS-painted wall sits underneath as first paint and as the fallback when WebGL, JS or motion is unavailable.
- All text and controls are real HTML. Canvas is `aria-hidden`.
- Keep the working, accessible tab and lightbox behaviour; restyle rather than reinvent.
- Shared styles in `site.css`, shared behaviour in `site.js`, page-specific CSS inline as now.

## Quality floor

WCAG 2.2 AA: contrast (check type on the darkest wall tone and on glass), visible focus, 44px targets, keyboard paths through nav, drawer, tabs and lightbox, sensible reading order. No horizontal scroll at 375. No layout shift from late assets. Lean first load: no hero image request, fonts non-blocking.

## How to judge it

Preview with `node preview-safe.mjs` (http://127.0.0.1:4318; new files must be tracked to be served). Look at the rendered pages at 375, 768, 1280 and 1440, top to bottom, plus: drawer open, each tab, lightbox, reduced motion, WebGL off. Check the console. Diff every price, treatment name, review and link against the current live page. Then ask the Chanel question: what can come off?

Done means: the first screen is unmistakably The Skin Den and nobody else; a phone visitor can reach a price and a booking route in two taps; nothing approved has changed; nothing is clipped, low-contrast or broken; and it is honest about what was not verified.

## Outcome (2026-11-10, local only)

Built as specified. Checked on the local preview: 27 scripted interaction checks pass (lamp, tabs, deep links, lightbox, drawer, phone strip, reduced motion, no WebGL); no horizontal scroll at 390, 768, 1024, 1280, 1440, 1920; text contrast passes on all four pages. Lighthouse lab, phone, throttled: performance 98, accessibility 100, LCP 1.9s, CLS 0.07. Not verified: a real phone GPU, Safari and Firefox, real-user field data. Not committed or deployed.

Changed from the live page, for Rachel to see: the three photo "pathway" cards are gone (their two photos with them); "Price list" and "Treatments" headings are now one "Treatments & prices"; the category index shows "from £100" for Skin Boosters (her cheapest booster) and "£120" for Polynucleotides; "by Rachel" beside the wordmark is now her real plaque. Every treatment, price, description, review, FAQ answer and policy line is unchanged.

## Hero, second pass (2026-11-10, after Kyle's feedback: "it looks too AI")

What was wrong: the drawn wall was a smooth synthetic gradient; cream ground plus hairline serif plus pill button is the look every generated page has; nothing in the first screen was real except the logo.

What replaced it:
- **Her real room.** The hero is Rachel's own photograph (sign, ring light, steamer mid-plume). No drawn wall, no canvas. `wall.js` is no longer loaded.
- **Her wall colour as the ground.** `--c-wall` is now `#7A665C`, sampled from the photograph, so the picture melts into the page with no overlay. It is also the booking band and the 404 page. Ivory text on it is 5.1:1.
- **Lettering that matches her sign.** Display type is Fraunces at weight 600 (was 300), site-wide. Same family as before, close in weight to the logo. Running serif text stays light.
- **Wide screens:** photograph at the right, words on the wall in ivory. **Phones:** photograph fills the screen, the words start just under the sign and sit in a veil of steam in charcoal; the booking button is on the first screen (checked at 390×844 and 375×667).
- **Section 2** lost its copy of the room photograph and is now the statement alone.

Next, waiting on Kyle's OK to spend Higgsfield credits: turn the still into a film of the same shot (locked camera, only the steam moves), a 9:16 version for phones and a widened 16:9 version for desktop. Prompts were written by an Opus agent first, per Kyle's rule. Quote: up to 62 credits (phone film 14, widen 2, desktop film 14, optional 4K still 2, two retakes 28). The widened left side is AI-extended wall and will be frozen as a still; the sign is composited back from the real photograph so its lettering cannot change.

Checks after this pass: 28 scripted interaction checks pass; no horizontal scroll at 375, 390, 768, 1440; contrast passes; Lighthouse lab, phone, throttled: performance 99, accessibility 100, LCP 2.0s, CLS 0.002.

## Hero film (2026-11-10, Kyle approved up to 62 Higgsfield credits; 30 spent)

The hero photograph now moves: a 7.5 second silent loop of the same frame in which only the steam drifts.

- **Generated:** two Kling 3.0 pro takes from Rachel's real photo (14 credits each) and one 16:9 widening (2).
  - Take pinned to the real photo at both start and end: kept. Camera locked, room and sign unchanged, nothing invented.
  - Free-running take: rejected. It redrew the room sharper and invented a person's face on the bed.
  - 16:9 widening: rejected. It invented a cabinet, a product trolley and wall art that are not in Rachel's room. Desktop therefore uses the same real portrait film in the right-hand column.
- **Made honest in post (ffmpeg, local):** Rachel's real photograph is composited over every frame everywhere except a feathered steam area, so the sign, wall, lamp and linen are her real pixels (measured: under 1 level of difference from the photo). The last half second is crossfaded into the first for a seamless loop.
- **Files:** `brand_assets/video/room-loop.mp4` (1084x1912, 884 KB), `room-loop-720.mp4` (291 KB, phones), `brand_assets/room-poster.webp/.jpg` (the loop's first frame; it is the hero `<img>` so the film fades in with no jump).
- **Behaviour:** loads only after the page has loaded; never under reduced motion or data saver; pauses off screen; if the browser refuses autoplay the photograph stays.
- **Checks:** 31 scripted interaction checks pass (film playing on desktop and phone, off under reduced motion). Lighthouse lab, phone, throttled: performance 98, accessibility 100, LCP 2.2s, CLS 0. Not verified: iPhone Safari autoplay and Low Power Mode on a real device.

The best next step for the desktop hero is a real wide photo or ten seconds of phone video from Rachel, shot from the same spot.

## Internal files hidden from the live site (2026-11-10, Kyle's OK, live as `6f16624`)

GitHub Pages published every tracked file. `_config.yml` now excludes the project notes and docs, client intake, spec, `CLAUDE.md`, the WhatsApp checklist, `google-guide.pdf`, the `platform-api` source, `design_mocks`, `brand_assets/scrape` (it held screenshots of client messages), the OG template, `src`, `video`, package files and dev scripts. Verified after the build: 32 hidden paths return 404, 27 runtime paths still 200, `/account/` and `/admin/` load with no failed module requests. The one "password" line in the admin-login doc, in every version, only points to the git-ignored local file. The repository itself is still public.

## Treatments & prices, white pass (branch `redesign/treatments-white`, not committed or live)

Kyle asked for a more modern, more beautiful section, "all white with black text" if needed. Designed directly by Opus 5.5 in this session, not routed to `designer`.

- One white sheet with rounded corners, laid over a cream-to-ivory band so it bridges "Meet Rachel" above and the reviews below. Edge to edge on phones. Text is black (`#111`), body copy warm grey (`#55514C`, 7.9:1).
- Categories became a segmented control with a sliding white pill, pinned under the nav for the whole list at every width (it used to be a side column on desktop). Script updated to match: one horizontal orientation; the covered area is the pinned band; the chosen category scrolls into view on phones.
- Rows: three columns from 1000px (name, description, price); stacked below. Tags are small black pills. Before-and-afters are an overlapping stack of round photos.
- Removed: the round RestoraPlex photo that sat under the old side column.
- Unchanged: all 17 treatments, prices and descriptions, tags, notes, before-and-after photos, every id and deep link, the JSON-LD.
- Checks: 31 interaction checks pass; contrast clean; content diff identical; no horizontal scroll at 375, 390, 768, 1024, 1280, 1440; keyboard focus visible on the switcher; no-JS shows every category with its heading; high-contrast and reduced-transparency modes get a solid white band.

## v3 "clean" system (2026-11-12, branch `redesign/v3-clean`, not committed or live)

Kyle: "keep trying to make it look more modern, clean and professional." Designed directly by Opus 5.5 in this session, not routed to `designer`. The approved real-room hero and its film are unchanged except for the inset frame below.

Rules (tokens in `site.css`; `tokens.css` and `--c-charcoal` are untouched because `/account` and `/admin` use them):
- **Grounds:** white page (`--page`), one warm panel (`--panel`, the brand cream) for "Meet Rachel" and booking only, charcoal footer. The hero keeps her wall colour as the photo's ground.
- **Panels:** `.panel` = inset `--panel-inset` (8–20px, 0 on phones) with `--panel-radius` (28–44px), no shadow. Its container is narrowed by the inset so content lines up with every other section. The hero uses the same side inset on tablet and desktop but stays flush with the top of the page (the nav's pill sits on it), so only its bottom corners are rounded. On phones the booking panel is square at the bottom where it meets the footer.
- **Ink:** `--ink` #111 for all text and buttons on light grounds, `--ink-soft` #55514C for body copy, `--line-ink` for every rule. Gold is kept only for link underlines and footer labels; the hero and footer keep ivory text on their dark grounds.
- **Type:** headlines Fraunces 600 at one size (`--t-section`); large running serif text (leads, quotes, booking copy, FAQ questions, footer line) Fraunces 400 at `--t-serif-lead`. No more 300-weight serif.
- **Frames:** photos have rounded corners; the offset outline mounts are gone.
- **Rhythm:** section padding one step tighter; a hairline separates treatments and reviews, which share the white ground. Footer is two columns up to 1100px.

Checks: `node tasks/checks/site-checks.mjs` (new, one script covering the earlier interaction, cookie, contrast, keyboard, no-JS and app checks): 51/51 on the live site before the change; 47/47 on the branch locally, with the two app checks live-only. Words, links, ids, images, the 17 treatment rows and the JSON-LD are identical on all four pages.
