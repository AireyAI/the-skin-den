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

export async function fetchMemberBookings() {
  return memberPlatformFetch("/v1/member/bookings");
}
