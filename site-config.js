export const SITE_CONFIG = Object.freeze({
  identity: {
    name: "The Skin Den",
    short: "TSD",
    tagline: "Every appointment, tailored to you.",
    description:
      "Advanced skincare and acne specialist studio in Carlisle. VTCT-qualified, results-driven treatments."
  },
  siteOrigin: "https://theskinden.co.uk",
  publicOrigin: "https://theskinden.co.uk",
  venue: {
    name: "The Skin Den",
    street: "73 Greymoor Way",
    district: "",
    city: "Carlisle",
    postcode: "CA3 0FQ",
    mapUrl:
      "https://www.google.com/maps/search/?api=1&query=73+Greymoor+Way+Carlisle+CA3+0FQ",
    unitPublished: false
  },
  social: {
    instagramHandle: "_theskin_den",
    instagramUrl: "https://www.instagram.com/_theskin_den/"
  },
  contact: {
    email: "rachel@theskinden.co.uk",
    phone: "+44 7568 602861",
    phoneTel: "+447568602861",
    whatsappUrl: "https://wa.me/447568602861"
  },
  booking: {
    /** Public booking page opened from the website. */
    clockworkBookUrl: "https://clockwork-bookings.vercel.app/m/the-skin-den/book",
    /**
     * Booking calendar API (Clockwork). Online card/Apple Pay is paused —
     * the previous Stripe platform account is closed; a replacement payouts
     * provider is pending. Do not re-enable stripeConnectEnabled until then.
     */
    apiUrl: "https://clockwork-bookings.vercel.app",
    slug: "the-skin-den",
    schedulePublished: true
  },
  payments: Object.freeze({
    /** Stripe Express / Connect CTA in admin — OFF while platform Stripe is closed. */
    stripeConnectEnabled: false,
    bannerTitle: "Online payouts paused",
    bannerLede:
      "Card and Apple Pay deposits are paused while we move to a new payments platform. Booking times still work — take payment by bank transfer or WhatsApp for now."
  }),
  forge: {
    gatewayUrl: "https://gateway-production-12ac.up.railway.app",
    gatewayApiKey: ""
  },
  /**
   * Skin Den ONLY platform-api (Railway project skin-den-platform).
   * Never point this at another studio's URL — SQLite + JWT are tenant-isolated.
   */
  platformApiUrl: "https://platform-api-production-3d5f.up.railway.app",
  analytics: Object.freeze({
    measurementId: "",
    propertyId: "",
    reportUrl: ""
  }),
  admin: Object.freeze({
    theme: "salon",
    hideScanner: true,
    hideGymMemberFilters: true
  }),
  clientAccount: Object.freeze({
    /** Treatment appointments (Clockwork), not platform-api class_bookings. */
    bookingsUrl:
      "https://clockwork-bookings.vercel.app/api/m/the-skin-den/member/bookings",
    appleRedirectUri: "https://theskinden.co.uk/account/"
  })
});

if (typeof window !== "undefined") {
  window.SITE_CONFIG = SITE_CONFIG;
}
