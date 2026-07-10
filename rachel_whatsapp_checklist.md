# WhatsApp checklist — items to confirm with Rachel

Paste this to her on WhatsApp (07568 602861). Pick up replies as she sends them — most should take her 5–10 min total.

---

> Hi Rachel — Kyle here. I've built a first version of your website. Quick checklist to make sure I've got everything right and tailored to you. Reply as you can:
>
> **1. Your surname / how you want to be credited?**
> The site currently says "Rachel" — happy to add a surname or leave it as first-name only.
>
> **2. Email address?**
> Need one for the contact form + booking confirmations.
>
> **3. Working hours?**
> e.g. "Tue, Wed, Fri 10am-6pm, Sat 9am-3pm" — whatever fits. We'll display these on the site.
>
> **4. Address handling — public or private?**
> Currently the site says *"Address shared on booking confirmation"*. Want me to put the full Greymoor Way address on the site instead? Most home-studio practitioners prefer to keep it private until booking — but it's your call.
>
> **5. Your headshot for the "Meet Rachel" section?**
> A professional photo if you have one, or a clear selfie. Even a phone snap on a plain wall works.
>
> **5a. Any awards or industry recognition we should feature?**
> e.g. "2026 Best Beauty Treatments", "Acne Specialist Certification 2024", etc. Send the exact wording + year(s) and we'll add a feature card on the site.
>
> **6. Testimonials — can I use these 3 quotes with the client's first name + initial?**
> *(I scraped these from your IG Client Reviews highlight — happy to swap for ones you like more if you tell me)*
>   - **Louise T.** — "Absolutely loved my facial. I felt so relaxed throughout, my skin was glowing afterwards..."
>   - **Sarah M.** — *placeholder name* — anonymous chemical peel review starting "Thank you so much for my chemical peel this morning..."
>   - **Emma R.** — *placeholder name* — acne treatment plan review (I drafted this one — let me know the real first name)
>
> **7. The cancellation policy I've put on the site uses your real wording from IG (50% deposit for new clients, 50% under 48h, 100% under 24h / no-show). Is that still your current policy?**
>
> **8. Online booking + deposit payments — let's switch this on now.**
> The site's ready for it — I've written you a full step-by-step guide to set up Fresha yourself (~15-20 min, one sitting): [see `rachel_fresha_setup_guide.md` — send that as its own message/doc]. It's free for you, free for clients, and takes your 50% deposit automatically so no more wasted slots. Once you're done, send me the booking link it gives you at the end and I'll have it live on the site same day.
>
> **9. Domain — sorted.**
> `theskinden.co.uk` is bought and live — the site's officially on its real domain now.
>
> **10. Anything I've got wrong?**
> Have a scroll through when I send you the preview link. Anything you'd word differently, miss out, or want highlighted differently — tell me. This is yours.
>
> When you've got 10 min to reply, I'll plug everything in and send you the live preview link.

---

## Internal notes (don't send to Rachel)

- 2026-07-09: Fresha CTA is now actually wired in `studio.html` — search for `FRESHA_BOOKING_URL` (in the booking-CTA script near the bottom). Paste her real Fresha public booking page URL into that one constant and the #book panel auto-switches: status pill, copy, and a new "Book & pay deposit online" primary CTA all update themselves. No other edits needed.
- Fresha's deposit/card-on-file is real payment processing tied to Rachel's own bank details — she has to connect that herself inside Fresha (Settings → Payments). Neither Kyle nor Claude can do this step on her behalf.
- We can swap in real Fresha embed in 5 mins when she's ready — the slot is already designed and reserved on the booking section.
- The Aria chatbot has been pre-trained with her treatments, prices, policy and contact info — it'll route serious enquiries to her WhatsApp automatically.
- We have her real 50% deposit / 48h / 24h policy live on `/policy.html` — this matches what she has on her IG story.
- We have 123 of her real work photos in `brand_assets/photos/` — currently 8 are wired into the gallery. We can swap any for Rachel's preferred ones if she has favourites.
- Headshot can be generated via Nano Banana if she doesn't have one — but that's a fallback. A real photo always wins.
