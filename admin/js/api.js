/**
 * Admin API — live platform-api; localhost demo JSON when API is unavailable.
 */

function isLocalDev() {
  const h = location.hostname;
  return h === "localhost" || h === "127.0.0.1";
}

async function loadDemoSnapshot() {
  const res = await fetch(new URL("../data/members.demo.json", import.meta.url));
  if (!res.ok) throw new Error("Demo data missing");
  const demo = await res.json();
  const members = (demo.members || []).map((m) => ({
    ...m,
    daysUntilRenewal: daysUntil(m.renewalDate)
  }));
  return {
    mode: "demo",
    members,
    bookings: demo.bookings || [],
    paymentEvents: demo.paymentEvents || [],
    revenue: demo.revenue || null,
    activity: demo.activity || {},
    websiteAnalytics: demo.websiteAnalytics || null,
    schedule: demo.schedule || null
  };
}

function daysUntil(isoDate) {
  if (!isoDate) return null;
  const end = new Date(`${isoDate}T12:00:00`);
  const now = new Date();
  now.setHours(12, 0, 0, 0);
  return Math.ceil((end - now) / (1000 * 60 * 60 * 24));
}

export async function fetchDashboardSnapshot() {
  const base = window.KK_ADMIN_API_BASE?.replace(/\/$/, "");
  if (!base) {
    if (isLocalDev()) return loadDemoSnapshot();
    throw new Error("Studio API is not configured. Hard-refresh the page or contact support.");
  }
  try {
    const res = await fetch(`${base}/dashboard`, {
      headers: authHeaders(),
      credentials: "include"
    });
    if (res.status === 401) {
      throw new Error("Session expired — sign in again.");
    }
    if (!res.ok) throw new Error(`Could not load dashboard (${res.status})`);
    const json = await res.json();
    return { ...json, mode: json.mode || "live" };
  } catch (err) {
    if (isLocalDev()) {
      console.warn("[admin] live API unavailable — using demo data", err);
      return loadDemoSnapshot();
    }
    throw err;
  }
}

async function adminGet(path) {
  const base = window.KK_ADMIN_API_BASE?.replace(/\/$/, "");
  if (!base) throw new Error("Admin API not configured");
  const res = await fetch(`${base}${path}`, { headers: authHeaders(), credentials: "include" });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

export function fetchBookings(status = "all") {
  const q = status && status !== "all" ? `?status=${encodeURIComponent(status)}` : "";
  return adminGet(`/bookings${q}`);
}

export function fetchPayments() {
  return adminGet("/payments");
}

const BOOKING_TOKEN_KEY = "cw-admin-token";

function bookingApi() {
  return window.SITE_CONFIG?.booking?.apiUrl?.replace(/\/$/, "") || "";
}

function bookingConnectUrl() {
  const slug = window.SITE_CONFIG?.booking?.slug || "";
  return `${bookingApi()}/api/m/${encodeURIComponent(slug)}/connect/link`;
}

export function getBookingToken() {
  return localStorage.getItem(BOOKING_TOKEN_KEY);
}

export function setBookingToken(token) {
  if (token) localStorage.setItem(BOOKING_TOKEN_KEY, token);
  else localStorage.removeItem(BOOKING_TOKEN_KEY);
}

/**
 * Signs in to the booking system as well, so payout setup targets the Stripe
 * account that actually receives treatment payments. Same credentials.
 */
export async function signInToBookingSystem(email, password) {
  const base = bookingApi();
  if (!base) return null;
  const res = await fetch(`${base}/api/auth?action=token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.token) {
    throw new Error(data.error || `Booking sign-in failed (${res.status})`);
  }
  setBookingToken(data.token);
  return data.token;
}

/** Payout readiness read from the system that takes the money. */
export async function fetchStripeStatus() {
  const base = bookingApi();
  const token = getBookingToken();
  if (!base) return adminGet("/stripe/status");
  if (!token) {
    return { configured: true, connected: false, chargesEnabled: false, readyForCheckout: false, detailsSubmitted: false, needsReauth: true };
  }
  const res = await fetch(bookingConnectUrl(), { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 401) {
    setBookingToken(null);
    return { configured: true, connected: false, chargesEnabled: false, readyForCheckout: false, detailsSubmitted: false, needsReauth: true };
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Payout status failed (${res.status})`);
  return data;
}

export function fetchCheckIns() {
  return adminGet("/check-ins");
}

async function adminPost(path, payload) {
  const base = window.KK_ADMIN_API_BASE?.replace(/\/$/, "");
  if (!base) throw new Error("Admin API not configured");
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload || {})
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `API ${res.status}`);
    err.status = res.status;
    // Carried through so the door can offer an override instead of a dead end.
    err.canOverride = Boolean(data.canOverride);
    err.member = data.member || null;
    throw err;
  }
  return data;
}

export function postAdminCheckIn(scan, { override = false, overrideReason = "" } = {}) {
  return adminPost("/check-in", { scan, override, overrideReason });
}

export function fetchUnlinked() {
  return adminGet("/members/unlinked");
}

export function linkMembership(memberId, userEmail) {
  return adminPost(`/members/${encodeURIComponent(memberId)}/link`, { userEmail });
}

export function unlinkMembership(memberId) {
  return adminPost(`/members/${encodeURIComponent(memberId)}/unlink`, {});
}

export function adjustCredits(memberId, { delta, setTo, note } = {}) {
  return adminPost(`/members/${encodeURIComponent(memberId)}/credits`, { delta, setTo, note });
}

export function createMember(payload) {
  return adminPost("/members", payload);
}

export function fetchSchedule() {
  return adminGet("/schedule");
}

export async function resetScheduleFromSeed() {
  const base = window.KK_ADMIN_API_BASE?.replace(/\/$/, "");
  if (!base) throw new Error("Admin API not configured");
  const res = await fetch(`${base}/schedule/reset-from-seed`, {
    method: "POST",
    headers: authHeaders()
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `API ${res.status}`);
  return data;
}

export async function saveSchedule(doc) {
  const base = window.KK_ADMIN_API_BASE?.replace(/\/$/, "");
  if (!base) throw new Error("Admin API not configured");
  const res = await fetch(`${base}/schedule`, {
    method: "PUT",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(doc)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `API ${res.status}`);
  return data;
}

export async function requestStripeConnectLink() {
  if (window.SITE_CONFIG?.payments?.stripeConnectEnabled !== true) {
    throw new Error(
      window.SITE_CONFIG?.payments?.bannerLede ||
        "Stripe Express is disabled — the previous payments account is closed."
    );
  }
  const base = bookingApi();
  if (!base) throw new Error("Booking API not configured");
  const token = getBookingToken();
  if (!token) {
    throw new Error("Payout setup needs a fresh sign-in — sign out, sign back in, then try again.");
  }
  const returnOrigin = (
    window.SITE_CONFIG?.siteOrigin ||
    window.SITE_CONFIG?.publicOrigin ||
    window.location.origin
  ).replace(/\/$/, "");

  const res = await fetch(bookingConnectUrl(), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ returnOrigin })
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    setBookingToken(null);
    throw new Error("Payout setup needs a fresh sign-in — sign out, sign back in, then try again.");
  }
  if (!res.ok) throw new Error(data.error || "Could not open payout setup");
  return data;
}

/** One click → Stripe-hosted payout setup (same as Kettle Kulture). */
export async function startStripePayoutSetup() {
  const { url } = await requestStripeConnectLink();
  if (!url) throw new Error("No Stripe link returned");
  window.location.assign(url);
}

const ADMIN_TOKEN_KEY = "kk-admin-token";
const LEGACY_SESSION_KEY = "kk-admin-session";

/** One-time: move token from sessionStorage (old behaviour) to localStorage. */
function migrateAdminTokenStorage() {
  const legacy = sessionStorage.getItem(ADMIN_TOKEN_KEY);
  if (legacy && !localStorage.getItem(ADMIN_TOKEN_KEY)) {
    localStorage.setItem(ADMIN_TOKEN_KEY, legacy);
  }
  sessionStorage.removeItem(ADMIN_TOKEN_KEY);
  sessionStorage.removeItem("kk-admin-session");
}

export function getAdminToken() {
  migrateAdminTokenStorage();
  return localStorage.getItem(ADMIN_TOKEN_KEY);
}

export function authHeaders() {
  const token = getAdminToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function setAdminToken(token) {
  migrateAdminTokenStorage();
  if (token) localStorage.setItem(ADMIN_TOKEN_KEY, token);
  else localStorage.removeItem(ADMIN_TOKEN_KEY);
}

export async function markMemberContacted(memberId) {
  const base = window.KK_ADMIN_API_BASE?.replace(/\/$/, "");
  if (!base) throw new Error("Admin API not configured");
  const res = await fetch(`${base}/members/${encodeURIComponent(memberId)}/contacted`, {
    method: "POST",
    headers: authHeaders(),
    credentials: "include"
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

export { daysUntil };
