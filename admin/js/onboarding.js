/**
 * First-run coach tour — The Skin Den studio admin.
 */
import { setTab } from "./ledger.js";

const STORAGE_KEY = "kk-admin-tour-v1-done";

const STEPS = [
  {
    target: "#kpi-heading",
    title: "Welcome to your studio dashboard",
    body:
      "This is your control room for The Skin Den — clients, treatment bookings, and payments in one place. Everything here updates from the live platform when you tap Refresh.",
    tab: "members"
  },
  {
    target: "#kpi-grid",
    title: "Overview numbers",
    body:
      "Class revenue and online booking fees (last 30 days), paid bookings, pending checkouts, active subscriptions, and failed payments.",
    tab: "members"
  },
  {
    target: "#admin-tab-bar",
    title: "Tabs",
    body:
      "Members, Scanner (door check-in), Bookings, Classes (times and prices on the public site), and Payments.",
    tab: "members"
  },
  {
    target: "#filter-bar",
    title: "Member filters",
    body:
      "Start with Needs attention for renewals, failed payments, and low pack credits.",
    tab: "members"
  },
  {
    target: "#panel-members .members-table",
    title: "Member list",
    body:
      "Tap a row to see details, suggested messages, WhatsApp, and Mark contacted.",
    tab: "members"
  },
  {
    target: "#schedule-heading",
    title: "Class times and prices",
    body:
      "Set days, times, prices, and capacity. Save to website updates the public booking page.",
    tab: "schedule"
  },
  {
    target: "#bookings-heading",
    title: "Class bookings",
    body:
      "Website bookings appear here — Pending until Stripe checkout completes, then Paid.",
    tab: "bookings"
  },
  {
    target: "#payments-heading",
    title: "Payment ledger",
    body:
      "Completed checkouts with customer amount and booking fee (5%). Match to Stripe if you reconcile.",
    tab: "payments"
  },
  {
    target: "#stripe-banner",
    title: "Get paid online",
    body:
      "Tap Set up payouts once. Stripe asks for bank and ID (~5 minutes). When done, this banner goes away.",
    tab: "members",
    skipIfHidden: true
  },
  {
    target: "#copilot-panel",
    title: "Aria priorities",
    body:
      "Summarises who to contact today from your live data. Ask about failed payments or renewals.",
    tab: "members"
  },
  {
    target: "#refresh-btn",
    title: "Keep data fresh",
    body:
      "After a booking or payment on the site, tap Refresh. Reopen this tour anytime from Guide.",
    tab: "members"
  }
];

let index = 0;
let root = null;
let titleEl;
let bodyEl;
let progressEl;
let cardEl;
let spotEl;
let stepToken = 0;

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function isMobileTour() {
  return window.matchMedia("(max-width: 960px)").matches;
}

export function isAppReady() {
  const app = document.getElementById("admin-app");
  const gate = document.getElementById("admin-gate");
  if (!app || app.hidden) return false;
  if (gate && !gate.hidden) return false;
  return true;
}

function isVisible(el) {
  if (!el || el.hidden) return false;
  if (el.closest("[hidden]")) return false;
  const r = el.getBoundingClientRect();
  return r.width > 8 && r.height > 8;
}

function advancePastHiddenSteps() {
  while (index < STEPS.length) {
    const step = STEPS[index];
    if (!step.skipIfHidden) break;
    const probe = document.querySelector(step.target);
    if (probe && isVisible(probe)) break;
    index += 1;
  }
}

function switchToTab(tab) {
  setTab(tab);
}

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function waitForTarget(selector, maxMs = 400) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const el = document.querySelector(selector);
    if (el && isVisible(el)) return el;
    await wait(32);
  }
  return document.querySelector(selector);
}

function positionCard(targetEl) {
  if (!cardEl) return;
  cardEl.classList.toggle("tour-card--dock", isMobileTour());

  if (isMobileTour()) {
    cardEl.style.top = "";
    cardEl.style.left = "";
    cardEl.style.transform = "";
    return;
  }

  cardEl.style.transform = "";
  const pad = 12;
  const margin = 16;
  const cardW = cardEl.offsetWidth || 320;
  if (!targetEl || !isVisible(targetEl)) {
    cardEl.style.top = "50%";
    cardEl.style.left = "50%";
    cardEl.style.transform = "translate(-50%, -50%)";
    return;
  }
  const rect = targetEl.getBoundingClientRect();
  cardEl.style.left = `${Math.max(margin, Math.min(rect.left, window.innerWidth - margin - cardW))}px`;
  const below = rect.bottom + pad;
  const above = rect.top - pad - cardEl.offsetHeight;
  if (below + cardEl.offsetHeight < window.innerHeight - margin) cardEl.style.top = `${below}px`;
  else if (above > margin) cardEl.style.top = `${above}px`;
  else cardEl.style.top = `${margin}px`;
}

function highlightTarget(el) {
  if (!spotEl) return;
  if (!el || !isVisible(el)) {
    spotEl.style.opacity = "0";
    return;
  }
  const r = el.getBoundingClientRect();
  const inset = 6;
  spotEl.style.opacity = "1";
  spotEl.style.top = `${Math.max(0, r.top - inset)}px`;
  spotEl.style.left = `${Math.max(0, r.left - inset)}px`;
  spotEl.style.width = `${Math.min(window.innerWidth, r.width + inset * 2)}px`;
  spotEl.style.height = `${Math.min(window.innerHeight, r.height + inset * 2)}px`;
}

function setTourUiLock(locked) {
  document.documentElement.classList.toggle("tour-active", locked);
  document.body.classList.toggle("tour-active", locked);
}

async function renderStep() {
  const token = ++stepToken;
  advancePastHiddenSteps();
  if (index >= STEPS.length) {
    finish(true);
    return;
  }

  const step = STEPS[index];
  switchToTab(step.tab);
  await wait(0);
  await waitForTarget(step.target);

  if (token !== stepToken) return;

  const target = document.querySelector(step.target);
  if (titleEl) titleEl.textContent = step.title;
  if (bodyEl) bodyEl.textContent = step.body;
  if (progressEl) progressEl.textContent = `Step ${index + 1} of ${STEPS.length}`;

  if (target && isVisible(target)) {
    target.scrollIntoView({ block: "nearest", behavior: prefersReducedMotion() ? "auto" : "smooth" });
    await wait(prefersReducedMotion() ? 0 : 120);
  }

  if (token !== stepToken) return;

  highlightTarget(target);
  positionCard(target);

  const backBtn = root?.querySelector(".tour-back");
  const nextBtn = root?.querySelector(".tour-next");
  if (backBtn) backBtn.hidden = index === 0;
  if (nextBtn) nextBtn.textContent = index >= STEPS.length - 1 ? "Done" : "Next";
}

function finish(save) {
  stepToken += 1;
  if (save) {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* private mode */
    }
  }
  root?.setAttribute("hidden", "");
  setTourUiLock(false);
  index = 0;
  switchToTab("members");
}

function goNext() {
  if (index >= STEPS.length - 1) finish(true);
  else {
    index += 1;
    void renderStep();
  }
}

function goBack() {
  index = Math.max(0, index - 1);
  void renderStep();
}

function openTour() {
  if (!isAppReady()) return;
  if (!root) buildRoot();
  index = 0;
  root.removeAttribute("hidden");
  setTourUiLock(true);
  void renderStep();
}

function buildRoot() {
  if (root) return;

  root = document.createElement("div");
  root.id = "admin-tour";
  root.className = "tour-root";
  root.setAttribute("hidden", "");

  const backdrop = document.createElement("div");
  backdrop.className = "tour-backdrop";
  backdrop.setAttribute("aria-hidden", "true");

  spotEl = document.createElement("div");
  spotEl.className = "tour-spotlight";
  spotEl.setAttribute("aria-hidden", "true");

  cardEl = document.createElement("div");
  cardEl.className = "tour-card";
  cardEl.setAttribute("role", "dialog");
  cardEl.setAttribute("aria-modal", "true");
  cardEl.setAttribute("aria-labelledby", "tour-title");
  cardEl.addEventListener("click", (e) => e.stopPropagation());

  progressEl = document.createElement("p");
  progressEl.className = "tour-progress";

  titleEl = document.createElement("h2");
  titleEl.className = "tour-title";
  titleEl.id = "tour-title";

  bodyEl = document.createElement("p");
  bodyEl.className = "tour-body";

  const actions = document.createElement("div");
  actions.className = "tour-actions";

  const skipBtn = document.createElement("button");
  skipBtn.type = "button";
  skipBtn.className = "btn btn--ghost tour-skip";
  skipBtn.textContent = "Skip tour";
  skipBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    finish(true);
  });

  const backBtn = document.createElement("button");
  backBtn.type = "button";
  backBtn.className = "btn btn--ghost tour-back";
  backBtn.textContent = "Back";
  backBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    goBack();
  });

  const nextBtn = document.createElement("button");
  nextBtn.type = "button";
  nextBtn.className = "btn btn--primary tour-next";
  nextBtn.textContent = "Next";
  nextBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    goNext();
  });

  actions.append(skipBtn, backBtn, nextBtn);
  cardEl.append(progressEl, titleEl, bodyEl, actions);
  root.append(backdrop, spotEl, cardEl);
  document.body.append(root);

  root.addEventListener(
    "keydown",
    (e) => {
      if (root.hasAttribute("hidden")) return;
      if (e.key === "Escape") {
        e.preventDefault();
        finish(true);
      } else if (e.key === "Enter" && e.target === nextBtn) {
        goNext();
      }
    },
    true
  );

  window.addEventListener(
    "resize",
    () => {
      if (root.hasAttribute("hidden")) return;
      const step = STEPS[index];
      if (!step) return;
      const target = document.querySelector(step.target);
      highlightTarget(target);
      positionCard(target);
    },
    { passive: true }
  );
}

export function initOnboardingTour() {
  buildRoot();
  document.getElementById("tour-btn")?.addEventListener("click", () => openTour());
}

export function maybeStartOnboarding({ mode } = {}) {
  if (mode === "demo") return;
  if (!isAppReady()) return;
  try {
    if (localStorage.getItem(STORAGE_KEY) === "1") return;
  } catch {
    return;
  }
  window.setTimeout(() => {
    if (isAppReady()) openTour();
  }, prefersReducedMotion() ? 300 : 800);
}
