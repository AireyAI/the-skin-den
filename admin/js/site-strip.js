/**
 * Live status and quick links.
 */
import { ga4ReportUrl } from "./analytics-url.mjs";

function origin() {
  return (
    window.SITE_CONFIG?.siteOrigin ||
    window.SITE_CONFIG?.publicOrigin ||
    "https://theskinden.co.uk"
  ).replace(/\/$/, "");
}

export function renderClientStatus(snapshot) {
  const live = document.getElementById("live-status");

  if (live) {
    live.hidden = false;
    live.dataset.mode = snapshot?.mode === "demo" ? "demo" : "live";
    live.textContent =
      snapshot?.mode === "demo" ? "Preview mode — demo data (connect platform-api for live)" : "Live studio data";
  }

  renderQuickLinks(snapshot?.websiteAnalytics);
}

function renderQuickLinks(websiteAnalytics) {
  const wrap = document.getElementById("site-quick-links");
  if (!wrap) return;
  const base = origin();
  const analyticsHref =
    websiteAnalytics?.reportUrl ||
    ga4ReportUrl(window.SITE_CONFIG?.analytics);
  wrap.replaceChildren();

  const links = [
    { href: `${base}/`, label: "View website" },
    { href: `${base}/#book`, label: "Booking section (public)" },
    { href: analyticsHref, label: "Website visits (Analytics)", external: true }
  ];

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
