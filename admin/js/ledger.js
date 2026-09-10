import { showSchedulePanel } from "./schedule-panel.js";
import { showCheckinPanel, teardownCheckinPanel } from "./checkin-panel.js";
import { labelOffering, isSalonAdmin } from "./treatment-catalog.js";
import {
  authHeaders,
  fetchBookings,
  fetchPayments,
  fetchStripeStatus,
  requestStripeConnectLink
} from "./api.js";

let els = {};

export function initLedgerPanel() {
  els = {
    banner: document.getElementById("stripe-banner"),
    bannerText: document.getElementById("stripe-banner-text"),
    connectBtn: document.getElementById("stripe-connect-btn"),
    tabBar: document.getElementById("admin-tab-bar"),
    panelMembers: document.getElementById("panel-members"),
    panelBookings: document.getElementById("panel-bookings"),
    panelPayments: document.getElementById("panel-payments"),
    bookingsBody: document.getElementById("bookings-body"),
    paymentsBody: document.getElementById("payments-body"),
    bookingFilter: document.getElementById("booking-filter"),
    panelSchedule: document.getElementById("panel-schedule"),
    panelCheckin: document.getElementById("panel-checkin")
  };

  els.tabBar?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-tab]");
    if (!btn) return;
    setTab(btn.dataset.tab);
  });

  els.bookingFilter?.addEventListener("change", () => refreshBookings());
  els.connectBtn?.addEventListener("click", () => {
    void goStripeSetup(els.connectBtn);
  });
}

function stripeConnectEnabled() {
  return window.SITE_CONFIG?.payments?.stripeConnectEnabled === true;
}

async function goStripeSetup(btn) {
  if (!btn) return;
  const errEl = document.getElementById("stripe-connect-error");
  if (!stripeConnectEnabled()) {
    if (errEl) {
      errEl.hidden = false;
      errEl.textContent =
        "Stripe Express is disabled — the previous payments account is closed. A new payouts platform is being set up.";
    }
    btn.disabled = true;
    return;
  }
  btn.disabled = true;
  const label = btn.textContent;
  btn.textContent = "Opening Stripe…";
  if (errEl) {
    errEl.hidden = true;
    errEl.textContent = "";
  }
  try {
    const data = await requestStripeConnectLink();
    if (data.readyForCheckout && data.linkKind === "express_dashboard") {
      await refreshStripeBanner();
    }
    if (!data.url) throw new Error("No Stripe link returned — try again or contact support.");
    window.location.href = data.url;
  } catch (err) {
    const msg = err.message || "Could not open payout setup.";
    if (errEl) {
      errEl.hidden = false;
      errEl.textContent = msg;
    } else {
      alert(msg);
    }
    btn.disabled = false;
    btn.textContent = label;
  }
}

export { goStripeSetup };

let activeTab = "members";

function setTab(tab) {
  if (activeTab === "checkin" && tab !== "checkin") teardownCheckinPanel();
  activeTab = tab;

  const shell = document.getElementById("admin-app");
  shell?.classList.toggle("admin-shell--scanner", tab === "checkin");

  els.tabBar?.querySelectorAll("[data-tab]").forEach((b) => {
    const on = b.dataset.tab === tab;
    b.classList.toggle("is-active", on);
    b.setAttribute("aria-selected", on ? "true" : "false");
  });
  els.panelMembers.hidden = tab !== "members";
  els.panelBookings.hidden = tab !== "bookings";
  els.panelPayments.hidden = tab !== "payments";
  if (els.panelSchedule) els.panelSchedule.hidden = tab !== "schedule";
  if (els.panelCheckin) els.panelCheckin.hidden = tab !== "checkin";
  if (tab === "bookings") refreshBookings();
  if (tab === "schedule") showSchedulePanel();
  if (tab === "checkin") showCheckinPanel();
  if (tab === "payments") refreshPayments();
}

export async function refreshStripeBanner() {
  if (!els.banner || !window.KK_ADMIN_API_BASE) return false;

  // Platform Stripe account closed — never offer Express onboarding.
  if (!stripeConnectEnabled()) {
    const pay = window.SITE_CONFIG?.payments || {};
    const title = document.getElementById("stripe-banner-heading");
    if (title) title.textContent = pay.bannerTitle || "Online payouts paused";
    els.banner.hidden = false;
    els.bannerText.textContent =
      pay.bannerLede ||
      "Card deposits are paused while we move to a new payments platform.";
    if (els.connectBtn) {
      els.connectBtn.hidden = true;
      els.connectBtn.disabled = true;
    }
    return false;
  }

  try {
    const status = await fetchStripeStatus();
    if (status.readyForCheckout) {
      els.banner.hidden = true;
      return true;
    }
    els.banner.hidden = false;
    const needsMore =
      status.detailsSubmitted && !status.readyForCheckout;
    els.bannerText.textContent = needsMore
      ? "Stripe needs a few more details before you can take payments. Tap the button to finish — usually under five minutes."
      : "One step left: tell Stripe where to send your treatment payments. Bank details and ID — about five minutes, then you’re live.";
    els.connectBtn.hidden = !status.configured;
    els.connectBtn.disabled = false;
    els.connectBtn.textContent = needsMore ? "Finish payout setup" : "Set up payouts";
    return false;
  } catch {
    els.banner.hidden = true;
    return false;
  }
}

export function renderRevenueKpis(revenue, kpiGrid, computeMemberKpis) {
  if (!revenue || !kpiGrid) return;
  const k = computeMemberKpis();
  const cards = [
    { label: "Revenue (30d)", value: revenue.grossLabel || "£0.00" },
    { label: "Booking fee (30d)", value: revenue.platformFeeLabel || "£0.00" },
    { label: "Payments (30d)", value: String(revenue.paidCount ?? 0) },
    { label: "Paid bookings (30d)", value: String(revenue.paidBookingCount ?? 0) },
    {
      label: "Pending checkouts",
      value: String(revenue.pendingCheckoutCount ?? 0),
      warn: (revenue.pendingCheckoutCount ?? 0) > 0
    },
  ];
  if (!isSalonAdmin()) {
    cards.push({ label: "Active subs", value: String(k.activeSubscriptions) });
  }
  if (k.paymentFailures > 0) {
    cards.push({
      label: "Failed payments",
      value: String(k.paymentFailures),
      warn: true
    });
  }
  kpiGrid.replaceChildren();
  for (const c of cards) {
    const article = document.createElement("article");
    article.className = `kpi-card${c.warn ? " kpi-card--warn" : ""}`;
    const label = document.createElement("p");
    label.className = "kpi-label";
    label.textContent = c.label;
    const value = document.createElement("p");
    value.className = "kpi-value";
    value.textContent = c.value;
    article.append(label, value);
    kpiGrid.append(article);
  }
}

async function refreshBookings() {
  if (!els.bookingsBody) return;
  els.bookingsBody.replaceChildren(tr("Loading…", 7));
  try {
    const status = els.bookingFilter?.value || "all";
    const data = await fetchBookings(status);
    const rows = data.bookings || [];
    els.bookingsBody.replaceChildren();
    if (!rows.length) {
      els.bookingsBody.append(tr("No bookings yet.", 7));
      return;
    }
    for (const b of rows) {
      els.bookingsBody.append(buildBookingRow(b));
    }
  } catch (err) {
    els.bookingsBody.replaceChildren(tr(err.message, 7));
  }
}

function buildBookingRow(b) {
  const row = document.createElement("tr");
  const nameCell = document.createElement("td");
  const strong = document.createElement("strong");
  strong.textContent = b.customerName || "";
  const br = document.createElement("br");
  const muted = document.createElement("span");
  muted.className = "cell-muted";
  muted.textContent = b.customerEmail || "";
  nameCell.append(strong, br, muted);

  const cells = [
    nameCell,
    td(labelOffering(b.offeringId)),
    td(b.slotDate),
    td(b.priceLabel),
    td(b.platformFeeLabel),
    tdBadge(b.status),
    td(formatWhen(b.createdAt))
  ];
  for (const c of cells) row.append(c);
  return row;
}

async function refreshPayments() {
  if (!els.paymentsBody) return;
  els.paymentsBody.replaceChildren(tr("Loading…", 5));
  try {
    const data = await fetchPayments();
    const rows = data.events || [];
    els.paymentsBody.replaceChildren();
    if (!rows.length) {
      els.paymentsBody.append(tr("No payment events yet — completed checkouts appear here.", 5));
      return;
    }
    for (const p of rows) {
      const row = document.createElement("tr");
      row.append(
        td(formatWhen(p.createdAt)),
        td(p.source),
        td(p.amountLabel),
        td(p.platformFeeLabel),
        td(p.customerEmail || "—")
      );
      els.paymentsBody.append(row);
    }
  } catch (err) {
    els.paymentsBody.replaceChildren(tr(err.message, 5));
  }
}

function td(text) {
  const cell = document.createElement("td");
  cell.textContent = text ?? "";
  return cell;
}

function tdBadge(status) {
  const cell = document.createElement("td");
  const span = document.createElement("span");
  span.className = `badge badge--${status || "pending"}`;
  span.textContent = status || "";
  cell.append(span);
  return cell;
}

function tr(text, colspan) {
  const row = document.createElement("tr");
  const cell = document.createElement("td");
  cell.colSpan = colspan;
  cell.textContent = text;
  row.append(cell);
  return row;
}

function formatWhen(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}

export { setTab, refreshBookings, refreshPayments };
