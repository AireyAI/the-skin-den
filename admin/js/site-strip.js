/**
 * Live status, quick links, activity row, Stripe return handling.
 */
import { refreshStripeBanner } from "./ledger.js";
import { ga4ReportUrl } from "./analytics-url.mjs";

let toastTimer;

function origin() {
  return (
    window.SITE_CONFIG?.siteOrigin ||
    window.SITE_CONFIG?.publicOrigin ||
    "https://theskinden.co.uk"
  ).replace(/\/$/, "");
}

function showToast(message) {
  let el = document.getElementById("admin-toast");
  if (!el) {
    el = document.createElement("p");
    el.id = "admin-toast";
    el.className = "admin-toast";
    el.setAttribute("role", "status");
    document.getElementById("admin-app")?.prepend(el);
  }
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.hidden = true;
  }, 6000);
}

export function handleStripeReturnQuery() {
  const params = new URLSearchParams(window.location.search);
  const stripe = params.get("stripe");
  if (!stripe) return;
  const clean = window.location.pathname + window.location.hash;
  window.history.replaceState({}, "", clean);
  if (stripe === "return") {
    showToast("Checking payout setup…");
    void refreshStripeBanner().then((ready) => {
      if (ready) {
        showToast("You’re live — treatment payments on the website will go to your bank.");
      } else {
        showToast("If Stripe asked for more info, tap Set up payouts again to finish.");
      }
    });
  } else if (stripe === "refresh") {
    showToast("That link expired — tap Set up payouts again.");
  }
}

export function renderClientStatus(snapshot) {
  const live = document.getElementById("live-status");

  if (live) {
    live.hidden = false;
    live.textContent =
      snapshot?.mode === "demo" ? "Preview mode — demo data (connect platform-api for live)" : "Live studio data";
  }

  renderQuickLinks(snapshot?.websiteAnalytics);
  renderActivity(snapshot?.activity, snapshot?.websiteAnalytics);
}

function renderQuickLinks(websiteAnalytics) {
  const wrap = document.getElementById("site-quick-links");
  if (!wrap) return;
  const base = origin();
  const analyticsHref =
    websiteAnalytics?.reportUrl ||
    ga4ReportUrl(window.SITE_CONFIG?.analytics);
  wrap.replaceChildren();

  const bookUrl = window.SITE_CONFIG?.booking?.clockworkBookUrl || `${base}/studio.html#book`;
  const cwAdmin = window.SITE_CONFIG?.booking?.clockworkAdminUrl;
  const links = [
    { href: `${base}/studio.html`, label: "View website" },
    { href: bookUrl, label: "Book treatments (public)", external: Boolean(window.SITE_CONFIG?.booking?.clockworkBookUrl) },
    { href: "./reviews.html", label: "Review moderation" },
    { href: analyticsHref, label: "Website visits (Analytics)", external: true }
  ];
  if (cwAdmin) {
    links.splice(2, 0, { href: cwAdmin, label: "Booking admin (Clockwork)", external: true });
  }

  for (const item of links) {
    const a = document.createElement("a");
    a.className = "site-quick-link";
    a.href = item.href;
    a.textContent = item.label;
    if (item.external) {
      a.target = "_blank";
      a.rel = "noopener noreferrer";
    }
    wrap.append(a);
  }
}

function renderActivity(activity, websiteAnalytics) {
  const grid = document.getElementById("activity-grid");
  if (!grid || !activity) return;
  const last = activity.lastClassPaymentAt
    ? new Date(activity.lastClassPaymentAt).toLocaleString("en-GB", {
        dateStyle: "medium",
        timeStyle: "short"
      })
    : "—";

  const cards = [
    { label: "Paid bookings (7d)", value: String(activity.paidBookings7d ?? 0) },
    { label: "Pending checkouts", value: String(activity.pendingCheckouts ?? 0) },
    { label: "Payments logged (7d)", value: String(activity.paymentsRecorded7d ?? 0) },
    { label: "Last class payment", value: last }
  ];

  if (websiteAnalytics?.liveInDashboard && websiteAnalytics.activeUsers7d != null) {
    cards.push({
      label: "Site visitors (7d)",
      value: String(websiteAnalytics.activeUsers7d),
      href: websiteAnalytics.reportUrl
    });
  } else if (websiteAnalytics?.reportUrl) {
    cards.push({
      label: "Site visitors",
      value: "Open Analytics",
      href: websiteAnalytics.reportUrl
    });
  }

  grid.replaceChildren();
  for (const c of cards) {
    const article = document.createElement("article");
    article.className = "activity-card";
    if (c.href) {
      article.classList.add("activity-card--link");
      const link = document.createElement("a");
      link.className = "activity-card__link";
      link.href = c.href;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      const label = document.createElement("p");
      label.className = "kpi-label";
      label.textContent = c.label;
      const value = document.createElement("p");
      value.className = "kpi-value kpi-value--sm";
      value.textContent = c.value;
      link.append(label, value);
      article.append(link);
    } else {
      const label = document.createElement("p");
      label.className = "kpi-label";
      label.textContent = c.label;
      const value = document.createElement("p");
      value.className = "kpi-value kpi-value--sm";
      value.textContent = c.value;
      article.append(label, value);
    }
    grid.append(article);
  }
}
