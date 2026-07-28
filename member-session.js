/**
 * Shared member session helpers (account, booking, site nav).
 */
import { SITE_CONFIG } from "./site-config.js";

export const TOKEN_KEY = "kk_member_token";

export function getMemberToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setMemberToken(value) {
  if (value) localStorage.setItem(TOKEN_KEY, value);
  else localStorage.removeItem(TOKEN_KEY);
}

export function platformBase() {
  const fromWindow = (window.KK_PLATFORM_API || "").replace(/\/$/, "");
  if (fromWindow) return fromWindow;
  return (SITE_CONFIG.platformApiUrl || "").replace(/\/$/, "");
}

export async function memberPlatformFetch(path, options = {}) {
  const base = platformBase();
  if (!base) throw new Error("Membership service is starting up — try again shortly.");
  const headers = { ...(options.headers || {}) };
  const token = getMemberToken();
  if (token) headers.Authorization = "Bearer " + token;
  if (options.body) headers["Content-Type"] = "application/json";
  const res = await fetch(base + path, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || "Request failed");
    err.status = res.status;
    throw err;
  }
  return data;
}

export async function fetchMemberProfile() {
  return memberPlatformFetch("/v1/member/me");
}

function clockworkBookingsUrl() {
  const cfg = SITE_CONFIG.clientAccount?.bookingsUrl;
  if (cfg) return cfg.replace(/\/$/, "");
  const api = (SITE_CONFIG.booking?.apiUrl || "").replace(/\/$/, "");
  const slug = SITE_CONFIG.booking?.slug || "";
  if (api && slug) return `${api}/api/m/${encodeURIComponent(slug)}/member/bookings`;
  return "";
}

export async function fetchMemberBookings() {
  const cw = clockworkBookingsUrl();
  if (cw) {
    const token = getMemberToken();
    if (!token) throw new Error("Not signed in");
    const res = await fetch(cw, {
      headers: { Authorization: "Bearer " + token },
      credentials: "omit"
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || "Could not load appointments");
      err.status = res.status;
      throw err;
    }
    return data;
  }
  return memberPlatformFetch("/v1/member/bookings");
}
