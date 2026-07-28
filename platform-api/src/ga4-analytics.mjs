import { GoogleAuth } from "google-auth-library";
import { config } from "./config.mjs";

const READONLY_SCOPE = "https://www.googleapis.com/auth/analytics.readonly";

function parseServiceAccount() {
  const raw = config.ga4ServiceAccountJson?.trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function reportUrl() {
  if (config.ga4ReportUrl) return config.ga4ReportUrl;
  const pid = String(config.ga4PropertyId || "").replace(/^properties\//, "");
  if (pid) {
    return `https://analytics.google.com/analytics/web/#/p${pid}/reports/reportinghub`;
  }
  return "https://analytics.google.com/analytics/web/";
}

/**
 * Last-7-days active users + page views when GA4_PROPERTY_ID + service account JSON are set on Railway.
 * Otherwise returns link-only payload for the admin dashboard.
 */
export async function getWebsiteAnalyticsSummary() {
  const propertyId = String(config.ga4PropertyId || "").replace(/^properties\//, "");
  const credentials = parseServiceAccount();
  const base = {
    reportUrl: reportUrl(),
    measurementConfigured: Boolean(config.ga4MeasurementId),
    liveInDashboard: false,
    activeUsers7d: null,
    pageViews7d: null
  };

  if (!propertyId || !credentials) {
    return base;
  }

  try {
    const auth = new GoogleAuth({ credentials, scopes: [READONLY_SCOPE] });
    const client = await auth.getClient();
    const tokenResponse = await client.getAccessToken();
    const token = tokenResponse?.token;
    if (!token) return base;

    const res = await fetch(
      `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          dateRanges: [{ startDate: "7daysAgo", endDate: "today" }],
          metrics: [{ name: "activeUsers" }, { name: "screenPageViews" }]
        })
      }
    );

    if (!res.ok) {
      console.warn("[ga4] runReport failed:", res.status, await res.text().catch(() => ""));
      return base;
    }

    const json = await res.json();
    const values = json?.rows?.[0]?.metricValues || [];
    const activeUsers7d = values[0]?.value != null ? Number(values[0].value) : null;
    const pageViews7d = values[1]?.value != null ? Number(values[1].value) : null;

    return {
      ...base,
      liveInDashboard: true,
      activeUsers7d: Number.isFinite(activeUsers7d) ? activeUsers7d : null,
      pageViews7d: Number.isFinite(pageViews7d) ? pageViews7d : null
    };
  } catch (err) {
    console.warn("[ga4] summary error:", err.message || err);
    return base;
  }
}
