/**
 * Member account auth — FORGE gateway + Kettle Kulture platform API.
 */
import { SITE_CONFIG } from "../site-config.js";
import {
  formatDate,
  memberSummaryLine,
  renderMemberAlerts,
  renderMembershipFacts
} from "./membership-dates.js";
import { renderMemberBookings } from "./member-bookings.js";
import { fetchMemberBookings } from "../member-session.js";
import { mountAccountBooking } from "./account-book.js";
import {
  TOKEN_KEY,
  setMemberToken,
  memberPlatformFetch
} from "../member-session.js";

function gatewayBase() {
  const fromBrand = window.BRAND?.gatewayUrl || SITE_CONFIG.forge?.gatewayUrl || "";
  return fromBrand.replace(/\/$/, "");
}

function platformBase() {
  return (window.KK_PLATFORM_API || "").replace(/\/$/, "");
}

function setStatus(msg, tone = "error") {
  const el = document.getElementById("acct-status");
  if (!el) return;
  el.textContent = msg || "";
  el.dataset.tone = msg ? tone : "";
}

function token() {
  return localStorage.getItem(TOKEN_KEY);
}

function setToken(t) {
  setMemberToken(t);
}

async function gatewayFetch(path, options = {}) {
  const base = gatewayBase();
  const key = window.BRAND?.gatewayApiKey || SITE_CONFIG.forge?.gatewayApiKey;
  if (!base || !key) throw new Error("App gateway is not configured.");
  const headers = {
    "Content-Type": "application/json",
    "x-api-key": key,
    ...(options.headers || {})
  };
  const res = await fetch(base + path, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

async function platformFetch(path, options = {}) {
  return memberPlatformFetch(path, options);
}

function setBusy(form, busy) {
  if (!form) return;
  form.querySelectorAll("button[type=submit]").forEach((btn) => {
    btn.disabled = busy;
    if (busy) btn.dataset.kkLabel = btn.textContent;
    btn.textContent = busy ? "Please wait…" : btn.dataset.kkLabel || btn.textContent;
  });
}

function showGuest() {
  setAccountView("guest");
  updateOAuthUi();
}

function showRegister(open) {
  const reg = document.getElementById("register-form");
  const login = document.getElementById("login-form");
  if (!reg || !login) return;
  reg.hidden = !open;
  login.hidden = open;
  document.getElementById("acct-or")?.toggleAttribute("hidden", open);
  document.getElementById("oauth-signin-wrap")?.toggleAttribute("hidden", open || !oauthAvailable());
  if (!open) updateOAuthUi();
  if (open) document.getElementById("reg-email")?.focus();
  else document.getElementById("email")?.focus();
}

let appleClientId = null;
let googleClientId = null;
let publicAuthConfig = null;
const PUBLIC_CONFIG_CACHE_KEY = "kk_public_config_v1";

function applyPublicAuthConfig(pub) {
  if (!pub) return;
  publicAuthConfig = pub;
  if (pub.appleSignInEnabled && pub.appleClientId) appleClientId = pub.appleClientId;
  if (pub.googleSignInEnabled && pub.googleClientId) googleClientId = pub.googleClientId;
}

function setAppleSignInBusy(busy) {
  const btn = document.getElementById("btn-apple-signin");
  if (btn) {
    btn.disabled = busy;
    btn.setAttribute("aria-busy", busy ? "true" : "false");
    if (busy) {
      if (!btn.dataset.kkLabel) btn.dataset.kkLabel = btn.textContent;
      btn.textContent = "Opening…";
    } else {
      btn.textContent = btn.dataset.kkLabel || "Continue with Apple";
    }
  }
  const status = document.getElementById("acct-status");
  if (busy) setStatus("Connecting to Apple…", "ok");
  else if (status?.dataset.tone === "ok" && status.textContent.startsWith("Connecting")) setStatus("");
}

let appleOAuthInited = false;
function initAppleOAuthWhenReady() {
  if (appleOAuthInited || !appleClientId || !window.AppleID) return;
  initAppleSignInJs();
  bindAppleSignInButton();
  appleOAuthInited = true;
}

function whenAppleScriptReady(cb) {
  if (window.AppleID) {
    cb();
    return;
  }
  const started = Date.now();
  const tick = () => {
    if (window.AppleID) {
      cb();
      return;
    }
    if (Date.now() - started < 12000) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}


function oauthAvailable() {
  return Boolean(appleClientId || googleClientId);
}

function canonicalAppleRedirectUri() {
  const origin = (SITE_CONFIG.publicOrigin || window.location.origin).replace(/\/$/, "");
  return `${origin}/account/`;
}

function updateOAuthUi() {
  const wrap = document.getElementById("oauth-signin-wrap");
  const orEl = document.getElementById("acct-or");
  const googleStack = document.getElementById("google-oauth-stack");
  const appleBtn = document.getElementById("btn-apple-signin");
  const appleHint = document.getElementById("apple-setup-hint");
  const salon = salonAccountMode();
  const show = oauthAvailable() || salon;
  if (wrap) wrap.hidden = !show;
  if (orEl) orEl.hidden = false;
  if (googleStack) googleStack.hidden = !googleClientId;
  if (appleBtn) {
    appleBtn.hidden = false;
    appleBtn.disabled = !appleClientId;
    appleBtn.setAttribute("aria-disabled", appleClientId ? "false" : "true");
  }
  if (appleHint) appleHint.hidden = Boolean(appleClientId);
  if (googleClientId) queueGoogleButtonRender();
}

function oauthButtonWidthPx() {
  const stack = document.getElementById("google-oauth-stack");
  const card = document.getElementById("acct-guest");
  const el = stack || card;
  const w = el?.getBoundingClientRect().width || el?.offsetWidth || 0;
  return Math.max(280, Math.min(480, Math.round(w) || 320));
}

let googleButtonRenderQueued = false;

function queueGoogleButtonRender() {
  if (!googleClientId || !window.google?.accounts?.id) return;
  if (googleButtonRenderQueued) return;
  googleButtonRenderQueued = true;
  requestAnimationFrame(() => {
    googleButtonRenderQueued = false;
    initGoogleSignInJs(true);
  });
}

function bindAppleSignInButton() {
  const btn = document.getElementById("btn-apple-signin");
  if (!btn || btn.dataset.kkBound === "1") return;
  btn.addEventListener("click", () => {
    if (!appleClientId || !window.AppleID) {
      setStatus("Apple Sign In is finishing setup — create an account with email for now.", "error");
      return;
    }
    setAppleSignInBusy(true);
    AppleID.auth.signIn().catch((err) => {
      setAppleSignInBusy(false);
      setAccountView("guest");
      const code = err?.error || err?.message || "";
      if (code === "popup_closed_by_user") {
        setStatus("");
        return;
      }
      setStatus(code ? String(code) : "Apple sign-in failed.", "error");
    });
  });
  btn.dataset.kkBound = "1";
}

function initAppleSignInJs() {
  if (!appleClientId || !window.AppleID) return;
  AppleID.auth.init({
    clientId: appleClientId,
    scope: "name email",
    redirectURI: canonicalAppleRedirectUri(),
    usePopup: true
  });
}

function bindGoogleStackPassthrough() {
  const stack = document.getElementById("google-oauth-stack");
  const slot = document.getElementById("google-signin-btn");
  if (!stack || !slot || stack.dataset.kkPassthrough === "1") return;
  stack.addEventListener("click", (event) => {
    if (event.target !== stack && !stack.contains(event.target)) return;
    const iframe = slot.querySelector("iframe");
    const roleBtn = slot.querySelector('[role="button"]');
    if (roleBtn) {
      roleBtn.click();
      return;
    }
    if (iframe) {
      const rect = iframe.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) return;
    }
    setStatus("Google sign-in is still loading — wait a moment and try again.", "error");
  });
  stack.dataset.kkPassthrough = "1";
}

function initGoogleSignInJs(forceRerender = false) {
  if (!googleClientId || !window.google?.accounts?.id) return;
  const slot = document.getElementById("google-signin-btn");
  if (!slot) return;

  if (slot.dataset.kkInitialized !== "1") {
    google.accounts.id.initialize({
      client_id: googleClientId,
      callback: (response) => {
        completeGoogleSignIn(response.credential).catch((err) => setStatus(err.message));
      },
      auto_select: false,
      cancel_on_tap_outside: true
    });
    slot.dataset.kkInitialized = "1";
  }

  const render = () => {
    slot.replaceChildren();
    slot.dataset.kkRendered = "0";
    google.accounts.id.renderButton(slot, {
      type: "standard",
      theme: "outline",
      size: "large",
      text: "continue_with",
      width: oauthButtonWidthPx()
    });
    slot.dataset.kkRendered = "1";
  };

  if (forceRerender || slot.dataset.kkRendered !== "1") render();

  bindGoogleStackPassthrough();

  if (!slot.dataset.kkResizeBound) {
    window.addEventListener("resize", () => {
      if (!googleClientId) return;
      render();
    });
    slot.dataset.kkResizeBound = "1";
  }
}

/** Only use IDs from the live API or gateway — never static placeholders. */
async function loadAuthConfig() {
  appleClientId = null;
  googleClientId = null;

  try {
    const cached = sessionStorage.getItem(PUBLIC_CONFIG_CACHE_KEY);
    if (cached) applyPublicAuthConfig(JSON.parse(cached));
  } catch {
    /* ignore stale cache */
  }

  if (platformBase()) {
    try {
      const pub = await fetch(platformBase() + "/v1/public/config", { cache: "no-store" }).then((r) =>
        r.json()
      );
      applyPublicAuthConfig(pub);
      try {
        sessionStorage.setItem(PUBLIC_CONFIG_CACHE_KEY, JSON.stringify(pub));
      } catch {
        /* private mode */
      }
      initAppleOAuthWhenReady();
      if (appleClientId || googleClientId || pub.googleWalletEnabled) return;
    } catch {
      /* platform starting or offline */
    }
  }

  try {
    const pub = await gatewayFetch("/auth/public-config", { method: "GET" });
    applyPublicAuthConfig({ ...publicAuthConfig, ...pub });
    initAppleOAuthWhenReady();
  } catch {
    /* gateway origin not allowlisted yet */
  }
}

function gatewayConfigured() {
  const base = gatewayBase();
  const key = window.BRAND?.gatewayApiKey || SITE_CONFIG.forge?.gatewayApiKey;
  return Boolean(base && key);
}

function setAccountView(view) {
  const loading = document.getElementById("acct-loading");
  const guest = document.getElementById("acct-guest");
  const member = document.getElementById("acct-member");
  if (loading) loading.hidden = view !== "loading";
  if (guest) guest.hidden = view !== "guest";
  if (member) member.hidden = view !== "member";
}

function salonAccountMode() {
  return SITE_CONFIG.admin?.theme === "salon";
}

function showMember(data, bookingsPayload) {
  setStatus("");
  setAccountView("member");
  updateOAuthUi();

  const user = data.user;
  const m = data.membership;
  document.getElementById("member-name").textContent = user.name || user.email?.split("@")[0] || "there";
  document.getElementById("member-email").textContent = user.email || "";

  const sinceEl = document.getElementById("member-since");
  if (sinceEl) sinceEl.textContent = m?.joinedAt ? formatDate(m.joinedAt) : "—";

  const summaryEl = document.getElementById("member-summary");
  if (summaryEl) {
    summaryEl.textContent = salonAccountMode()
      ? "Your upcoming and past treatment appointments."
      : memberSummaryLine(m);
  }

  const membershipPanel = document.getElementById("membership-panel");
  if (membershipPanel) membershipPanel.hidden = salonAccountMode();

  if (!salonAccountMode()) {
    renderMemberAlerts(m, { signedIn: true, membershipPending: data.membershipPending });
    renderMembershipFacts(m, document.getElementById("membership-facts"));
  }

  const bookingsRoot = document.getElementById("member-bookings");
  renderMemberBookings(bookingsPayload, bookingsRoot);

  const bookRoot = document.getElementById("account-book");
  if (bookRoot && salonAccountMode()) {
    void mountAccountBooking(bookRoot, {
      user,
      onBooked: () => {
        void refresh();
      }
    });
  }
}

async function refresh() {
  if (!token()) {
    setAccountView("guest");
    return;
  }
  setAccountView("loading");
  try {
    const data = await platformFetch("/v1/member/me");
    showMember(data, { upcoming: [], past: [] });
    const bookingsPayload = await fetchMemberBookings().catch(() => ({ upcoming: [], past: [] }));
    showMember(data, bookingsPayload);
  } catch (err) {
    if (err.status === 401 || err.status === 404) {
      setToken(null);
      showGuest();
      setStatus("Your session expired — sign in again.", "error");
    } else {
      setAccountView("guest");
      setStatus(err.message || "Could not load your account. Try again in a moment.", "error");
    }
  }
}

async function adoptPlatformFromGoogle(credential) {
  const r = await platformFetch("/v1/auth/google", {
    method: "POST",
    body: JSON.stringify({ credential })
  });
  setToken(r.token);
  await refresh();
}

async function completeGoogleSignIn(credential) {
  setStatus("");
  if (!credential) throw new Error("Google did not return a sign-in token.");
  if (!platformBase()) {
    setStatus("Signed in with Google. Open your membership once the app is connected.");
    return;
  }
  await adoptPlatformFromGoogle(credential);
}

async function adoptPlatformFromApple(idToken, name) {
  const r = await platformFetch("/v1/auth/apple", {
    method: "POST",
    body: JSON.stringify({ idToken, name })
  });
  setToken(r.token);
  await refresh();
}

document.getElementById("login-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  setStatus("");
  const form = e.currentTarget;
  setBusy(form, true);
  try {
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;
    const r = await platformFetch("/v1/auth/member/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });
    setToken(r.token);
    await refresh();
  } catch (err) {
    setStatus(err.message);
  } finally {
    setBusy(form, false);
  }
});

document.getElementById("register-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  setStatus("");
  const form = e.currentTarget;
  setBusy(form, true);
  try {
    const r = await platformFetch("/v1/auth/member/register", {
      method: "POST",
      body: JSON.stringify({
        email: document.getElementById("reg-email").value.trim(),
        password: document.getElementById("reg-password").value,
        name: document.getElementById("reg-name").value.trim()
      })
    });
    setToken(r.token);
    await refresh();
  } catch (err) {
    setStatus(err.message);
  } finally {
    setBusy(form, false);
  }
});

document.getElementById("show-register")?.addEventListener("click", () => showRegister(true));
document.getElementById("show-login")?.addEventListener("click", () => showRegister(false));

async function completeAppleSignIn(detail) {
  setAppleSignInBusy(true);
  setStatus("Finishing sign-in…", "ok");
  const idToken = detail?.authorization?.id_token;
  if (!idToken) {
    setAppleSignInBusy(false);
    throw new Error("Apple did not return a sign-in token.");
  }
  const user = detail?.user;
  const name = user?.name
    ? [user.name.firstName, user.name.lastName].filter(Boolean).join(" ")
    : undefined;

  if (gatewayConfigured()) {
    gatewayFetch("/auth/apple", {
      method: "POST",
      body: JSON.stringify({
        idToken,
        name,
        deviceUserId: localStorage.getItem("fs_uid") || undefined
      })
    }).catch(() => {
      /* optional FORGE sync — never block Kettle Kulture login */
    });
  }

  try {
    if (platformBase()) {
      await adoptPlatformFromApple(idToken, name);
    } else {
      setAccountView("guest");
      setStatus("Signed in with Apple. Open your membership below once your account is linked.");
    }
  } finally {
    setAppleSignInBusy(false);
  }
}

async function devAppleMockSignIn() {
  if (location.hostname !== "localhost" || !platformBase()) return false;
  try {
    const r = await platformFetch("/v1/auth/apple", {
      method: "POST",
      body: JSON.stringify({ idToken: "dev-apple-mock", email: "dev.member@example.com" })
    });
    setToken(r.token);
    await refresh();
    return true;
  } catch (err) {
    setStatus(err.message);
    return true;
  }
}

document.addEventListener("AppleIDSignInOnSuccess", (event) => {
  completeAppleSignIn(event.detail).catch((err) => {
    setAppleSignInBusy(false);
    setAccountView("guest");
    setStatus(err.message);
  });
});

document.addEventListener("AppleIDSignInOnFailure", (event) => {
  const code = event?.detail?.error;
  if (code === "popup_closed_by_user") return;
  setStatus(
    code === "invalid_client"
      ? "Apple sign-in is not available yet — use email and password, or try again later."
      : code || "Apple sign-in failed."
  );
});

document.getElementById("sign-out")?.addEventListener("click", () => {
  setToken(null);
  setStatus("");
  document.getElementById("login-form")?.reset();
  document.getElementById("register-form")?.reset();
  showRegister(false);
  showGuest();
  document.getElementById("email")?.focus();
});

document.getElementById("refresh-account")?.addEventListener("click", () => {
  refresh().catch((err) => setStatus(err.message || "Refresh failed"));
});

/**
 * Attach a completed Stripe Checkout to the signed-in account.
 *
 * Memberships are no longer linked by matching the email someone typed at signup —
 * that let anyone claim a stranger's plan. The checkout session id is proof the
 * holder actually paid, and the API verifies it against Stripe.
 */
async function claimPurchase(sessionId) {
  if (!sessionId) {
    setStatus("Thanks — your membership is updating. Refresh if details are still catching up.", "ok");
    return;
  }
  try {
    await platformFetch("/v1/auth/member/claim", {
      method: "POST",
      body: JSON.stringify({ sessionId })
    });
    setStatus("Thanks — your membership is linked to this account.", "ok");
  } catch (err) {
    // The webhook may not have created the membership row yet; a refresh usually settles it.
    setStatus(
      err.message || "Payment received. If your plan is not showing in a minute, contact the studio.",
      "ok"
    );
  }
}

function warmAuthConfigFromCache() {
  try {
    const cached = sessionStorage.getItem(PUBLIC_CONFIG_CACHE_KEY);
    if (cached) applyPublicAuthConfig(JSON.parse(cached));
  } catch {
    /* ignore */
  }
}

async function bootAccountAuth() {
  if (token()) setAccountView("loading");
  else setAccountView("guest");

  warmAuthConfigFromCache();
  updateOAuthUi();
  whenAppleScriptReady(() => initAppleOAuthWhenReady());

  const configRefresh = loadAuthConfig().then(() => {
    updateOAuthUi();
    initAppleOAuthWhenReady();
  });

  if (await devAppleMockSignIn()) return;

  const params = new URLSearchParams(location.search);
  if (params.get("register") === "1") showRegister(true);
  if (params.get("purchased") === "1" && token()) {
    setStatus("Thanks — linking your purchase to this account…", "ok");
    await claimPurchase(params.get("session_id"));
  }
  const prefillEmail = params.get("email");
  if (prefillEmail) {
    const el = document.getElementById(params.get("register") === "1" ? "reg-email" : "email");
    if (el) el.value = prefillEmail;
  }

  updateOAuthUi();
  const initOAuth = () => {
    if (appleClientId) {
      initAppleSignInJs();
      bindAppleSignInButton();
    }
    if (googleClientId) {
      if (window.google?.accounts?.id) initGoogleSignInJs();
      else {
        const waitForGoogle = setInterval(() => {
          if (!googleClientId) {
            clearInterval(waitForGoogle);
            return;
          }
          if (window.google?.accounts?.id) {
            clearInterval(waitForGoogle);
            initGoogleSignInJs();
          }
        }, 80);
        setTimeout(() => clearInterval(waitForGoogle), 20000);
      }
    }
  };
  initOAuth();
  window.addEventListener("load", initOAuth, { once: true });

  await configRefresh;
  if (token()) await refresh();
}

bootAccountAuth().catch(() => {
  setAccountView("guest");
  updateOAuthUi();
});


document.addEventListener("kk:bookings-changed", () => {
  void refreshMemberBookingsPanel();
});

async function refreshMemberBookingsPanel() {
  const root = document.getElementById("member-bookings");
  if (!root) return;
  try {
    const bookingsPayload = await fetchMemberBookings();
    renderMemberBookings(bookingsPayload, root);
    attachRescheduleActions(root);
  } catch {
    /* keep current list */
  }
}
