# Setting up online booking & deposits — Rachel's step-by-step

Send this to Rachel once she's said yes to online booking (checklist item 8). It's written for her directly — you can forward it as-is on WhatsApp (split into a few messages) or as a PDF/doc.

Total time: ~15-20 minutes, done in one sitting.

---

> Hi Rachel — here's everything you need to get online booking and automatic deposits live on your site. It's called Fresha — free for you, free for clients, and it'll take your 50% deposit automatically so you never lose a slot to a no-show again.
>
> ## 1. Create your account
> Go to **fresha.com** → click **"For business"** → sign up with an email (can be a new one just for the business, or one you already use).
>
> ## 2. Set up your business profile
> - **Business name:** The Skin Den (by Rachel)
> - **Category:** Skin care / Facial studio / Acne treatment
> - **Phone:** 07568 602861
> - **Address:** 73 Greymoor Way, Carlisle, CA3 0FQ — Fresha lets you keep your exact address **private** and only show the general area (Carlisle, CA3) publicly, which matches what's already on the site ("address shared on booking confirmation"). Look for the address visibility toggle when you add it.
>
> ## 3. Add your treatments
> Go to **Catalogue → Services** and add each of these (copy the price straight in — descriptions are optional but nice to have):
>
> **Facials**
> | Treatment | Price | Suggested duration* |
> |---|---|---|
> | Skin Consultation & Advanced Facial (New Clients) | £50 | 75 min |
> | Advanced Facial | £45 | 60 min |
> | Advanced Facial & Dermaplaning | £55 | 75 min |
> | Acne Consultation & Treatment | £65 | 75 min |
>
> **Advanced treatments**
> | Treatment | Price | Suggested duration* |
> |---|---|---|
> | Microneedling | £70 | 60 min |
> | Microneedling x Polynucleotides | £110 | 75 min |
> | Chemical Peel | £60 | 45 min |
> | BioRePeel | £65 | 45 min |
> | BioRePeel x Dermaplaning | £75 | 60 min |
> | Hydradermabrasion Facial | £55 | 60 min |
>
> **Skin Boosters** *(course of 3 advised)*
> | Treatment | Price | Suggested duration* |
> |---|---|---|
> | Seventy Hyal | £100 | 45 min |
> | Lumi Pro | £115 | 45 min |
> | Revs Pro 32 | £125 | 45 min |
>
> *\*Durations are our best guess — change these to whatever actually matches your appointment slots. You know your timing better than we do.*
>
> ## 4. Turn on deposits (this is the important bit)
> Go to **Settings → No-show protection** (sometimes called "Booking protection" or "Deposits"):
> - Turn on **"Require card details / deposit for new clients"**
> - Set deposit to **50%** of the service price
> - Set your cancellation policy:
>   - **48+ hours notice:** free reschedule
>   - **Under 48 hours:** charge 50%
>   - **Under 24 hours or no-show:** charge 100%
>
> This is exactly the policy that's already written on your website and on your Instagram story — Fresha will now actually enforce it automatically instead of you having to chase anyone.
>
> ## 5. Connect your payouts
> Go to **Settings → Payments** and connect your bank account so deposits land with you. This step is between you and Fresha directly — neither Kyle nor Claude ever sees your bank details, only Fresha does. You may need to verify your identity (standard for any payment provider — usually a photo ID).
>
> ## 6. Set your working hours
> **Settings → Business hours** — whatever days/times you actually take clients. This is what stops people booking a slot you're not available for.
>
> ## 7. Get your booking link
> Go to **Settings → Online booking** (or **Marketing → Sales channels**) and copy your public booking page link — it'll look something like `fresha.com/book-now/the-skin-den-xxxxx`.
>
> **Send that link back to Kyle** — that's the last piece. He'll plug it into the site and your "Book a consultation" button goes live with real online booking and automatic deposits, same day.
>
> Any step confusing, just message and I'll jump on a call and walk through it with you.

---

## Internal notes (don't send to Rachel)

- Once she sends the booking URL, paste it into `FRESHA_BOOKING_URL` in `studio.html` (search for that constant, in the booking-CTA script near the bottom) — the panel auto-upgrades, no other edits needed. See `rachel_whatsapp_checklist.md` internal notes for the exact mechanism.
- Durations above are placeholders/suggestions only — we have no record of her real appointment slot lengths anywhere in `client_intake.md` or `SPEC.md`. Don't treat them as confirmed; flagged as her call in the message.
- After she connects payouts, Fresha may hold first payouts for a few days while it verifies her identity — standard for any new merchant account, worth mentioning if she asks why money hasn't landed instantly.
- Once the URL is wired in, do one real end-to-end test booking (small/refundable if Fresha allows a test mode, or just walk through the flow without completing payment) before calling this "live" — verify-before-completion applies to money flows more than anything else on this site.
