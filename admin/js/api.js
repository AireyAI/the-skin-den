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

/** Square routes on the studio API. Errors carry the server's message and code. */
async function squareCall(method, path, payload) {
  const base = window.KK_ADMIN_API_BASE?.replace(/\/$/, "");
  if (!base) {
    const err = new Error("The studio server isn't configured. Hard-refresh the page.");
    err.code = "no_api";
    throw err;
  }
  let res;
  try {
    res = await fetch(`${base}/square${path}`, {
      method,
      headers: { ...authHeaders(), ...(payload ? { "Content-Type": "application/json" } : {}) },
      credentials: "include",
      body: payload ? JSON.stringify(payload) : undefined
    });
  } catch {
    const err = new Error("Couldn't reach the studio server. Check your connection and try again.");
    err.code = "network";
    throw err;
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Square request failed (${res.status})`);
    err.status = res.status;
    err.code = data.code || "";
    throw err;
  }
  return data;
}

export const squareApi = {
  status: () => squareCall("GET", "/status"),
  connect: () => squareCall("POST", "/connect", {}),
  complete: (code, state) => squareCall("POST", "/complete", { code, state }),
  disconnect: () => squareCall("POST", "/disconnect", {}),
  links: () => squareCall("GET", "/payment-links"),
  createLink: (input) => squareCall("POST", "/payment-links", input),
  checkLink: (id) => squareCall("POST", `/payment-links/${encodeURIComponent(id)}/check`, {})
};

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
