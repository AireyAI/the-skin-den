import { fetchDashboardSnapshot, markMemberContacted, setAdminToken, getAdminToken } from "./api.js";
import {
  computeInsights,
  computeKpis,
  enrichMember,
  filterMembers,
  defaultOutreachMessage,
  whatsAppLink
} from "./insights.js";
import { createCopilot } from "./copilot.js";
import { initLedgerPanel, refreshStripeBanner, renderRevenueKpis } from "./ledger.js";
import { initCheckinPanel } from "./checkin-panel.js";
import { ensureAriaCoachAssistant } from "./aria-admin.js";
import { initOnboardingTour, maybeStartOnboarding, isAppReady } from "./onboarding.js";
import { renderClientStatus, handleStripeReturnQuery } from "./site-strip.js";
import { initSchedulePanel, hydrateScheduleFromDashboard } from "./schedule-panel.js";

const state = {
  members: [],
  insights: [],
  filter: "attention",
  selectedId: null,
  revenue: null
};

const els = {
  gate: document.getElementById("admin-gate"),
  app: document.getElementById("admin-app"),
  gateForm: document.getElementById("gate-form"),
  kpis: document.getElementById("kpi-grid"),
  tableBody: document.getElementById("members-body"),
  filterBar: document.getElementById("filter-bar"),
  drawer: document.getElementById("member-drawer"),
  drawerBackdrop: document.getElementById("drawer-backdrop"),
  refreshBtn: document.getElementById("refresh-btn")
};

let copilot;

function platformAdminBase() {
  return window.KK_ADMIN_API_BASE?.replace(/\/$/, "") || "";
}

async function boot() {
  window.__kkApplyPlatformConfig?.();

  const hasToken = !!getAdminToken();
  const host = location.hostname;
  const platformUrl = (window.SITE_CONFIG?.platformApiUrl || "").trim();
  const localPreview =
    (host === "localhost" || host === "127.0.0.1") && !platformUrl;
  if (hasToken || localPreview) {
    showApp();
    await load();
  } else {
    els.gate.hidden = false;
    els.app.hidden = true;
  }

  els.gateForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const base = platformAdminBase();
    const statusEl = document.getElementById("gate-status");
    if (statusEl) { statusEl.textContent = ""; statusEl.className = "gate-status"; }

    if (!base) {
      if (statusEl) {
        statusEl.textContent = "Studio API is not configured. Hard-refresh the page.";
        statusEl.className = "gate-status is-error";
      }
      return;
    }

    const email = document.getElementById("gate-email")?.value?.trim() || "";
    const password = document.getElementById("gate-password")?.value || "";
    if (!email) {
      if (statusEl) { statusEl.textContent = "Enter your coach email."; statusEl.className = "gate-status is-error"; }
      return;
    }
    if (!password) {
      if (statusEl) { statusEl.textContent = "Enter your password."; statusEl.className = "gate-status is-error"; }
      return;
    }
    const platform = window.KK_PLATFORM_API?.replace(/\/$/, "") || base.replace(/\/v1\/admin$/, "");

    const submitBtn = els.gateForm?.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;
    if (statusEl) { statusEl.textContent = "Signing in…"; statusEl.className = "gate-status is-busy"; }
    try {
      if (!platform) throw new Error("Dashboard API not configured. Hard-refresh the page.");
      const res = await fetch(`${platform}/v1/auth/coach/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      let data = {};
      try {
        data = await res.json();
      } catch {
        data = {};
      }
      if (!res.ok) throw new Error(data.error || `Login failed (${res.status})`);
      setAdminToken(data.token);
      if (statusEl) { statusEl.textContent = ""; statusEl.className = "gate-status"; }
      showApp();
      void load().catch((loadErr) => console.error("[admin] load after login", loadErr));
    } catch (err) {
      if (statusEl) { statusEl.textContent = err.message || "Sign-in failed"; statusEl.className = "gate-status is-error"; }
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });

  els.refreshBtn?.addEventListener("click", () => load());
  els.filterBar?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-filter]");
    if (!btn) return;
    els.filterBar.querySelectorAll("[data-filter]").forEach((b) => {
      b.classList.toggle("is-active", b === btn);
      b.setAttribute("aria-pressed", b === btn ? "true" : "false");
    });
    state.filter = btn.dataset.filter;
    renderTable();
  });

  els.drawerBackdrop?.addEventListener("click", closeDrawer);
  document.getElementById("drawer-close")?.addEventListener("click", closeDrawer);

  initLedgerPanel();
  initCheckinPanel();
  initOnboardingTour();
  initSchedulePanel();
  handleStripeReturnQuery();
  copilot = createCopilot({
    panel: document.getElementById("copilot-panel"),
    messagesEl: document.getElementById("copilot-messages"),
    inputEl: document.getElementById("copilot-input"),
    sendBtn: document.getElementById("copilot-send"),
    voiceBtn: document.getElementById("copilot-voice"),
    onAction: (action) => {
      if (action.type === "open_member") openDrawer(action.memberId);
      if (action.type === "contacted") load();
    }
  });
}

function showApp() {
  els.gate.hidden = true;
  els.app.hidden = false;
}

async function load() {
  try {
    const snapshot = await fetchDashboardSnapshot();
    state.members = snapshot.members.map(enrichMember);
    if (state.members.length === 0 && state.filter === "attention") {
      state.filter = "all";
      els.filterBar?.querySelectorAll("[data-filter]").forEach((b) => {
        const on = b.dataset.filter === "all";
        b.classList.toggle("is-active", on);
        b.setAttribute("aria-pressed", on ? "true" : "false");
      });
    }
    state.insights = computeInsights(state.members);
    state.revenue = snapshot.revenue || null;
    hydrateScheduleFromDashboard(snapshot.schedule);
    renderClientStatus(snapshot);
    renderKpis();
    renderTable();
    await refreshStripeBanner();
    await ensureAriaCoachAssistant(snapshot, { email: window.SITE_CONFIG?.contact?.email });
    copilot?.setContext(state.members);
    if (state.selectedId) openDrawer(state.selectedId);
    if (isAppReady()) maybeStartOnboarding({ mode: snapshot.mode === "demo" ? "demo" : "live" });
  } catch (err) {
    console.error(err);
    if (String(err.message || "").includes("Session expired")) {
      setAdminToken(null);
      els.app.hidden = true;
      els.gate.hidden = false;
      const statusEl = document.getElementById("gate-status");
      if (statusEl) {
        statusEl.textContent = err.message;
        statusEl.className = "gate-status is-error";
      }
      return;
    }
    clearChildren(els.tableBody);
    els.tableBody.append(
      rowMessage(`Could not load data. ${err.message}`, 6)
    );
  }
}

function renderKpis() {
  renderRevenueKpis(state.revenue, els.kpis, () => computeKpis(state.members));
}

function statusBadge(member) {
  const map = {
    active: "Active",
    expiring: "Expiring",
    payment_failed: "Payment failed",
    pack_low: "1 credit left",
    lapsed: "Lapsed"
  };
  const span = document.createElement("span");
  span.className = `badge badge--${member.status}`;
  span.textContent = map[member.status] || member.status;
  return span;
}


function emptyMembersMessage() {
  if (state.filter === "attention") {
    return "Nothing needs attention — no members on file yet, or everyone is up to date.";
  }
  if (state.members.length === 0) {
    return "No members yet. Real members appear here after sign-up, checkout, or when you add someone.";
  }
  return "No members in this view.";
}

function renderTable() {
  const rows = filterMembers(state.members, state.filter);
  clearChildren(els.tableBody);
  if (!rows.length) {
    els.tableBody.append(rowMessage(emptyMembersMessage(), 6));
    return;
  }
  for (const m of rows) {
    els.tableBody.append(buildMemberRow(m));
  }
}

function buildMemberRow(m) {
  const tr = document.createElement("tr");
  tr.dataset.id = m.id;
  tr.tabIndex = 0;
  tr.setAttribute("role", "button");
  tr.setAttribute("aria-label", `Open ${m.name}`);

  const renewal =
    m.planType === "subscription"
      ? m.renewalDate
        ? `${formatDate(m.renewalDate)}${m.renewalIn !== null ? ` (${m.renewalIn}d)` : ""}`
        : "—"
      : m.packExpiresAt
        ? `Pack exp ${formatDate(m.packExpiresAt)}`
        : "—";

  const tdName = document.createElement("td");
  const strong = document.createElement("strong");
  strong.textContent = m.name;
  const muted = document.createElement("span");
  muted.className = "cell-muted";
  muted.textContent = m.email;
  tdName.append(strong, document.createElement("br"), muted);

  const tdPlan = document.createElement("td");
  tdPlan.textContent = m.plan;

  const tdStatus = document.createElement("td");
  tdStatus.append(statusBadge(m));

  const tdRenewal = document.createElement("td");
  tdRenewal.textContent = renewal;

  const tdPay = document.createElement("td");
  tdPay.append(paymentPill(m.lastPaymentStatus));

  const tdActions = document.createElement("td");
  tdActions.className = "row-actions";
  const openBtn = document.createElement("button");
  openBtn.type = "button";
  openBtn.className = "btn btn--small btn--ghost";
  openBtn.textContent = "Open";
  openBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    openDrawer(m.id);
  });
  tdActions.append(openBtn);

  tr.append(tdName, tdPlan, tdStatus, tdRenewal, tdPay, tdActions);
  tr.addEventListener("click", () => openDrawer(m.id));
  tr.addEventListener("keydown", (e) => {
    if (e.key === "Enter") openDrawer(m.id);
  });
  return tr;
}

function paymentPill(status) {
  const span = document.createElement("span");
  if (status === "failed") {
    span.className = "pay pay--fail";
    span.textContent = "Failed";
  } else if (status === "pending") {
    span.className = "pay pay--pending";
    span.textContent = "Pending";
  } else {
    span.className = "pay pay--ok";
    span.textContent = "OK";
  }
  return span;
}

function openDrawer(id) {
  const m = state.members.find((x) => x.id === id);
  if (!m) return;
  state.selectedId = id;
  const insight = state.insights.find((i) => i.memberId === id);
  els.drawer.hidden = false;
  els.drawerBackdrop.hidden = false;
  document.body.classList.add("drawer-open");

  document.getElementById("drawer-name").textContent = m.name;

  const meta = document.getElementById("drawer-meta");
  clearChildren(meta);
  const line1 = document.createElement("p");
  line1.append(document.createTextNode(`${m.plan} · `), statusBadge(m));
  const line2 = document.createElement("p");
  line2.className = "drawer-contact";
  const mail = document.createElement("a");
  mail.href = `mailto:${m.email}`;
  mail.textContent = m.email;
  line2.append(mail, document.createTextNode(` · ${m.phone}`));
  meta.append(line1, line2);

  const factsEl = document.getElementById("drawer-facts");
  clearChildren(factsEl);
  const facts = [
    ["Last class", m.lastClassAt ? formatDate(m.lastClassAt) : "—"],
    ["Joined", formatDate(m.joinedAt)],
    [
      "Renewal / pack",
      m.planType === "subscription"
        ? m.renewalDate
          ? `${formatDate(m.renewalDate)} · auto-renew ${m.autoRenew ? "on" : "off"}`
          : "—"
        : `${m.packCredits ?? 0} credits left`
    ],
    ["Last payment", m.lastPaymentAt ? formatDate(m.lastPaymentAt) : "—"],
    ["Payment status", m.lastPaymentStatus || "—"],
    ["Notes", m.notes || "—"]
  ];
  for (const [k, v] of facts) {
    factsEl.append(buildFact(k, v));
  }

  const insightBox = document.getElementById("drawer-insight");
  const insightText = document.getElementById("drawer-insight-text");
  if (insight) {
    insightBox.hidden = false;
    insightText.textContent = insight.detail;
  } else {
    insightBox.hidden = true;
  }

  document.getElementById("drawer-whatsapp").onclick = () => {
    const msg = defaultOutreachMessage(m, insight);
    window.open(whatsAppLink(m.phone, msg), "_blank", "noopener,noreferrer");
    markMemberContacted(m.id);
    load();
  };

  document.getElementById("drawer-mark-contacted").onclick = async () => {
    try {
      await markMemberContacted(m.id);
      await load();
    } catch (err) {
      console.error(err);
    }
  };
}

function buildFact(label, value) {
  const div = document.createElement("div");
  div.className = "fact";
  const dt = document.createElement("dt");
  dt.textContent = label;
  const dd = document.createElement("dd");
  dd.textContent = value;
  div.append(dt, dd);
  return div;
}

function closeDrawer() {
  els.drawer.hidden = true;
  els.drawerBackdrop.hidden = true;
  document.body.classList.remove("drawer-open");
  state.selectedId = null;
}

function rowMessage(text, colspan) {
  const tr = document.createElement("tr");
  const td = document.createElement("td");
  td.colSpan = colspan;
  td.className = "empty-cell";
  td.textContent = text;
  tr.append(td);
  return tr;
}

function clearChildren(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

function formatDate(iso) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric"
  });
}

boot().catch((err) => {
  console.error("[admin] boot failed", err);
  const gate = document.getElementById("admin-gate");
  const statusEl = document.getElementById("gate-status");
  if (gate) gate.hidden = false;
  if (statusEl) statusEl.textContent = err?.message || "Admin failed to load. Hard-refresh and try again.";
});
