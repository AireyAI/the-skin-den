import { showCheckinPanel, teardownCheckinPanel } from "./checkin-panel.js";
import { isSalonAdmin } from "./treatment-catalog.js";
import { refreshSquareLinks } from "./square-panel.js";

let els = {};

export function initLedgerPanel() {
  els = {
    tabBar: document.getElementById("admin-tab-bar"),
    panelMembers: document.getElementById("panel-members"),
    panelCheckin: document.getElementById("panel-checkin"),
    panelPayments: document.getElementById("panel-square-payments")
  };

  els.tabBar?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-tab]");
    if (!btn) return;
    setTab(btn.dataset.tab);
  });
}

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
  if (els.panelMembers) els.panelMembers.hidden = tab !== "members";
  if (els.panelCheckin) els.panelCheckin.hidden = tab !== "checkin";
  if (els.panelPayments) els.panelPayments.hidden = tab !== "payments";
  if (tab === "checkin") showCheckinPanel();
  if (tab === "payments") void refreshSquareLinks();
}

/** Overview figures: client numbers, plus Square takings once Square is connected. */
export function renderOverviewKpis(kpiGrid, k, extraCards = []) {
  if (!kpiGrid || !k) return;
  const cards = [{ label: "Clients", value: String(k.totalMembers) }, ...extraCards];
  if (!isSalonAdmin()) {
    cards.push({ label: "Active subs", value: String(k.activeSubscriptions) });
  }
  if (k.paymentFailures > 0) {
    cards.push({ label: "Failed payments", value: String(k.paymentFailures), warn: true });
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

export { setTab };
