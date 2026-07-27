# Rachel — studio admin login (The Skin Den)

**Send this to Rachel** (change password after first sign-in if you prefer).

## Studio dashboard (members, bookings, payouts, Aria)

- **URL:** https://theskinden.co.uk/admin/  
  (After the site deploy finishes; locally: http://localhost:3000/admin/)
- **Email:** `rachel@theskinden.co.uk`
- **Password:** *(see Kyle — stored in `.admin-coach-password.local`, not in git)*

## First-time Stripe setup (5% platform fee on paid bookings)

1. Sign in at the admin URL above.
2. Tap **Set up payouts** on the banner (or **Connect Stripe to get paid** in Payments).
3. Complete Stripe’s short form (bank + ID).  
   - **Booking deposits on the website** (Clockwork embed) use:  
     https://clockwork-bookings.vercel.app/platform/the-skin-den/connect  
   - The admin banner tries the studio API first, then opens Clockwork Connect if needed.
4. When Stripe shows **charges enabled**, paid bookings on the site will split **95% to Rachel / 5% platform**.

## Booking admin (treatment calendar)

- https://clockwork-bookings.vercel.app/m/the-skin-den/admin  
- Same email/password once Clockwork merchant is seeded on production (Kyle to confirm).

## Support

If sign-in fails after a deploy, hard-refresh the page. API: `https://platform-api-production-3d5f.up.railway.app/health` should return OK.
