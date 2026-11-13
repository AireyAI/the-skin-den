/**
 * Small, pure helpers for the Square card and Payments tab (no DOM, no network).
 */

const money = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });

/** "£30.50" / "30.5" / "1,200" → whole pence; null when it isn't a plain amount. */
export function parseAmountToPence(text) {
  if (typeof text !== "string") return null;
  const cleaned = text.replace(/[£,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const [pounds, pence = ""] = cleaned.split(".");
  return Number(pounds) * 100 + Number(pence.padEnd(2, "0"));
}

export function formatPence(pence) {
  return money.format((pence || 0) / 100);
}

const STATUS = {
  creating: { label: "Creating", tone: "pending" },
  waiting: { label: "Waiting", tone: "pending" },
  paid: { label: "Paid", tone: "paid" },
  partly_refunded: { label: "Partly refunded", tone: "pending" },
  refunded: { label: "Refunded", tone: "quiet" },
  cancelled: { label: "Cancelled", tone: "quiet" },
  failed: { label: "Not created", tone: "failed" }
};

export function statusLabel(status) {
  if (STATUS[status]) return STATUS[status];
  const words = String(status || "").replace(/_/g, " ");
  return { label: words.charAt(0).toUpperCase() + words.slice(1), tone: "quiet" };
}

export function paymentMessage({ clientName = "", description, amountPence, url }) {
  const first = String(clientName).trim().split(/\s+/)[0];
  const hello = first ? `Hi ${first},` : "Hi,";
  return `${hello} here's your secure Square payment link for ${description} (${formatPence(amountPence)}): ${url}`;
}
