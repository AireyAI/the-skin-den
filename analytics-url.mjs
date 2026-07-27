/** GA4 admin report deep link + “is tagging live?” helper. */

export function ga4ReportUrl(analytics = {}) {
  const direct = (analytics.reportUrl || "").trim();
  if (direct) return direct;
  const pid = String(analytics.propertyId || "").trim().replace(/^properties\//, "");
  if (pid) {
    return `https://analytics.google.com/analytics/web/#/p${pid}/reports/reportinghub`;
  }
  return "https://analytics.google.com/analytics/web/";
}

export function isGa4MeasurementLive(analytics = {}) {
  const id = String(analytics.measurementId || "").trim();
  return Boolean(id && !/X{4,}/i.test(id));
}
