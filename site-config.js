export const SITE_CONFIG = Object.freeze({
  identity: {
    name: "The Skin Den",
    short: "TSD",
    tagline: "Made to perform. Not to pamper.",
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
    /** Public booking embed (Clockwork) — also linked from admin quick links. */
    clockworkBookUrl: "https://clockwork-bookings.vercel.app/m/the-skin-den/book",
    clockworkAdminUrl: "https://clockwork-bookings.vercel.app/m/the-skin-den/admin",
    clockworkConnectUrl: "https://clockwork-bookings.vercel.app/platform/the-skin-den/connect",
    schedulePublished: true
  },
  forge: {
    gatewayUrl: "https://gateway-production-12ac.up.railway.app",
    gatewayApiKey: ""
  },
  /**
   * Live platform-api (same stack as Kettle Kulture). Deploy a Skin Den instance
   * and set this URL — until then, localhost falls back to demo data when API is down.
   */
  platformApiUrl: "https://platform-api-production-3d5f.up.railway.app",
  analytics: Object.freeze({
    measurementId: "",
    propertyId: "",
    reportUrl: ""
  }),
  admin: Object.freeze({})
});

if (typeof window !== "undefined") {
  window.SITE_CONFIG = SITE_CONFIG;
}
