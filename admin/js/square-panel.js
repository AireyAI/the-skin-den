/**
 * Square on the studio desk: connect Rachel's own Square account, request payments by
 * link, and list those links with their verified status. If the studio server has no
 * Square setup (or can't be reached), the card keeps its plain "Open Square payment
 * links" button.
 */
import { squareApi, setAdminToken, getAdminToken } from "./api.js";
import { whatsAppLink } from "./insights.js";
import { labelCells } from "./table-labels.js";
import { formatPence, parseAmountToPence, statusLabel, paymentMessage } from "./square-ui.mjs";

const SQUARE_LINKS_URL = "https://app.squareup.com/dashboard/payment-links";

const CONNECT_ERRORS = {
  access_denied: "You didn't approve access on Square, so nothing changed. You can connect any time.",
  reauth: "For your security, sign in again, then connect Square.",
  state: "That Square sign-in expired or was already used. Please connect again.",
  different_merchant: "That's a different Square business from the one connected before. Contact us to change it."
};

let opts = { getMembers: () => [], onChange: () => {}, onNotConnected: () => {} };
let ready = false;
let status = null;
let links = [];
let paid30dPence = 0;
const el = (id) => document.getElementById(id);

export function initSquarePanel(options) {
  opts = { ...opts, ...options };
  ready = true;
  el("square-request-form")?.addEventListener("submit", onCreate);
  el("sq-cancel")?.addEventListener("click", closeRequest);
  el("sq-done")?.addEventListener("click", closeRequest);
  el("sq-copy")?.addEventListener("click", copyLink);
  el("sq-client")?.addEventListener("change", syncClientName);
  el("sq-request-open-2")?.addEventListener("click", openRequest);
  el("square-request-form")?.addEventListener("input", () => formMessage(""));
  void finishReturnFromSquare().then(refreshSquare);
}

/** Overview figure, shown once Square is connected. */
export function squareKpiCards() {
  if (!status?.connected) return [];
  return [{ label: "Paid with Square (30 days)", value: formatPence(paid30dPence) }];
}

export async function refreshSquare() {
  if (!ready) return;
  try {
    status = await squareApi.status();
  } catch {
    status = null; // server unreachable or not updated yet: keep the plain card
  }
  renderCard();
  if (status?.connected) await refreshSquareLinks();
  opts.onChange();
}

async function finishReturnFromSquare() {
  const back = window.__squareReturn;
  if (!back) return;
  window.__squareReturn = null;
  if (back.error) {
    showMessage(CONNECT_ERRORS[back.error] || "Square sign-in didn't finish. Please try again.");
    return;
  }
  if (!getAdminToken()) {
    // Signed out while on Square: the one-time code is tied to that sign-in, so say what to do.
    const gateStatus = document.getElementById("gate-status");
    if (gateStatus) {
      gateStatus.textContent = "You were signed out while connecting Square. Sign in, then tap Connect Square account again.";
      gateStatus.className = "gate-status is-error";
    }
    return;
  }
  showMessage("Finishing your Square connection…");
  try {
    await squareApi.complete(back.code, back.state);
    showMessage("Square is connected. You can now request payments here.");
  } catch (err) {
    showMessage(CONNECT_ERRORS[err.code] || err.message, { error: true });
  }
}

function showMessage(text, { error = false } = {}) {
  const msg = el("pay-banner-msg");
  if (!msg) return;
  msg.hidden = !text;
  msg.textContent = text || "";
  msg.classList.toggle("is-error", error);
  msg.setAttribute("role", error ? "alert" : "status");
}

function button(label, onClick, { primary = false } = {}) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = `btn ${primary ? "btn--primary" : "btn--ghost"} pay-banner__cta`;
  b.textContent = label;
  b.addEventListener("click", onClick);
  return b;
}

function squareLink(label = "Open Square") {
  const a = document.createElement("a");
  a.className = "pay-banner__link";
  a.href = SQUARE_LINKS_URL;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  a.textContent = label;
  const hint = document.createElement("span");
  hint.className = "sr-only";
  hint.textContent = " (opens in a new tab)";
  a.append(hint);
  return a;
}

function setCard({ title, meta = "", text, actions }) {
  el("pay-banner-heading").textContent = title;
  const metaEl = el("pay-banner-meta");
  metaEl.hidden = !meta;
  metaEl.replaceChildren(...(Array.isArray(meta) ? meta : meta ? [meta] : []));
  el("pay-banner-text").textContent = text;
  el("pay-banner-actions").replaceChildren(...actions);
}

function renderCard() {
  const tab = el("tab-payments");
  const dock = document.querySelector(".tab-dock");
  const connected = Boolean(status?.connected && !status.needsReconnect);
  if (tab) tab.hidden = !connected;
  if (dock) dock.hidden = !connected;
  if (!connected) opts.onNotConnected();

  if (!status || !status.configured) return; // plain card from the page stays

  if (!status.connected) {
    setCard({
      title: "Connect your Square account",
      text: "Sign in to Square once and approve access. You can then send payment links from here and see when they're paid. The money goes straight to your Square account.",
      actions: [button("Connect Square account", onConnect, { primary: true }), squareLink("Open Square payment links")]
    });
    return;
  }

  const badge = document.createElement("span");
  badge.className = `badge ${status.environment === "production" ? "badge--paid" : "badge--pending"}`;
  badge.textContent = status.environment === "production" ? "Live" : "Test mode";
  const where = document.createElement("span");
  where.textContent = [status.merchantName, status.locationName].filter(Boolean).join(" · ");

  if (status.needsReconnect) {
    setCard({
      title: "Reconnect Square",
      meta: [where],
      text: "Square access has stopped working. It may have been removed in Square. Disconnect, then connect again.",
      actions: [button("Disconnect", onDisconnect, { primary: true }), squareLink()]
    });
    return;
  }

  setCard({
    title: "Square connected",
    meta: [where, badge],
    text: "Request a payment and send the link to your client. It shows as Paid here once Square confirms it.",
    actions: [button("Request a payment", openRequest, { primary: true }), button("Disconnect", onDisconnect), squareLink()]
  });
}

async function onConnect(event) {
  const btn = event.currentTarget;
  btn.disabled = true;
  showMessage("");
  try {
    const { url } = await squareApi.connect();
    window.location.assign(url);
  } catch (err) {
    btn.disabled = false;
    if (err.code === "reauth") {
      showReauth();
      return;
    }
    showMessage(CONNECT_ERRORS[err.code] || err.message, { error: true });
  }
}

function showReauth() {
  showMessage(CONNECT_ERRORS.reauth, { error: true });
  const again = button("Sign in again", () => {
    setAdminToken(null);
    window.location.reload();
  }, { primary: true });
  el("pay-banner-actions").replaceChildren(again);
}

async function onDisconnect(event) {
  const ok = window.confirm("Disconnect Square? You won't be able to send payment links from here until you connect again. Payments already made are not affected.");
  if (!ok) return;
  const btn = event.currentTarget;
  btn.disabled = true;
  try {
    await squareApi.disconnect();
    showMessage("Square is disconnected.");
    closeRequest();
    await refreshSquare();
  } catch (err) {
    btn.disabled = false;
    if (err.code === "reauth") {
      showReauth();
      return;
    }
    showMessage(err.message, { error: true });
  }
}

function fillClients() {
  const select = el("sq-client");
  if (!select) return;
  const members = [...opts.getMembers()].sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const options = [new Option("Choose a client…", ""), ...members.map((m) => new Option(m.name, m.id)), new Option("Someone else", "__other")];
  select.replaceChildren(...options);
  syncClientName();
}

function syncClientName() {
  const other = el("sq-client")?.value === "__other";
  el("sq-client-name-field").hidden = !other;
}

function openRequest() {
  fillClients();
  el("square-request").hidden = false;
  el("square-request-form").hidden = false;
  el("square-result").hidden = true;
  formMessage("");
  el("square-request-form").reset();
  syncClientName();
  el("square-request").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  el("sq-client").focus({ preventScroll: true });
}

function closeRequest() {
  const box = el("square-request");
  if (box) box.hidden = true;
}

function formMessage(text) {
  const msg = el("sq-form-msg");
  msg.hidden = !text;
  msg.textContent = text || "";
}

async function onCreate(event) {
  event.preventDefault();
  const clientValue = el("sq-client").value;
  const member = opts.getMembers().find((m) => m.id === clientValue) || null;
  const clientName = member ? member.name : clientValue === "__other" ? el("sq-client-name").value.trim() : "";
  const description = el("sq-description").value.trim();
  const amountPence = parseAmountToPence(el("sq-amount").value);

  if (!clientName) return formMessage("Choose a client, or pick Someone else and type their name.");
  if (!description) return formMessage("Say what the payment is for, for example Deposit: Profhilo.");
  if (amountPence === null || amountPence < 100 || amountPence > 200000) return formMessage("Enter an amount between £1 and £2,000.");

  const btn = el("sq-create");
  btn.disabled = true;
  btn.textContent = "Creating…";
  formMessage("");
  try {
    const { link } = await squareApi.createLink({ clientName, memberId: member?.id, description, amountPence });
    showResult(link, member);
    await refreshSquareLinks();
    opts.onChange();
  } catch (err) {
    formMessage(err.code === "reconnect" ? "Square access needs renewing. Disconnect and connect Square again." : err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "Create link";
  }
}

function showResult(link, member) {
  el("square-request-form").hidden = true;
  el("square-result").hidden = false;
  el("sq-link-url").value = link.url;
  const text = paymentMessage({ clientName: link.clientName, description: link.description, amountPence: link.amountPence, url: link.url });
  const wa = el("sq-whatsapp");
  wa.href = member?.phone ? whatsAppLink(member.phone, text) : `https://wa.me/?text=${encodeURIComponent(text)}`;
  el("sq-copy").focus();
}

async function copyLink() {
  const input = el("sq-link-url");
  const btn = el("sq-copy");
  try {
    await navigator.clipboard.writeText(input.value);
    btn.textContent = "Copied";
  } catch {
    input.select();
    btn.textContent = "Press Copy on your keyboard";
  }
  setTimeout(() => {
    btn.textContent = "Copy link";
  }, 2000);
}

export async function refreshSquareLinks() {
  const body = el("square-links-body");
  try {
    ({ links, paid30dPence = 0 } = await squareApi.links());
  } catch (err) {
    if (body) body.replaceChildren(messageRow(`Couldn't load payments. ${err.message}`, true));
    return;
  }
  if (!body) return;
  if (!links.length) {
    body.replaceChildren(messageRow("No payment links yet. Tap Request a payment to send your first one."));
    return;
  }
  body.replaceChildren(...links.map(linkRow));
  labelCells(body);
}

function messageRow(text, isError = false) {
  const tr = document.createElement("tr");
  const td = document.createElement("td");
  td.colSpan = 6;
  td.className = `empty-cell${isError ? " is-error" : ""}`;
  td.textContent = text;
  tr.append(td);
  return tr;
}

function cell(text) {
  const td = document.createElement("td");
  td.textContent = text;
  return td;
}

function shortDate(iso) {
  return iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "—";
}

function linkRow(link) {
  const tr = document.createElement("tr");
  const s = statusLabel(link.status);
  const badge = document.createElement("span");
  badge.className = `badge badge--${s.tone}`;
  badge.textContent = s.label;
  const tdStatus = document.createElement("td");
  tdStatus.append(badge);

  const actions = document.createElement("td");
  actions.className = "row-actions";
  if (link.status === "waiting" && link.url) {
    const copy = document.createElement("button");
    copy.type = "button";
    copy.className = "btn btn--small btn--ghost";
    copy.textContent = "Copy link";
    copy.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(link.url);
        copy.textContent = "Copied";
      } catch {
        window.prompt("Copy this link:", link.url);
      }
    });
    const check = document.createElement("button");
    check.type = "button";
    check.className = "btn btn--small btn--ghost";
    check.textContent = "Check with Square";
    check.addEventListener("click", async () => {
      check.disabled = true;
      check.textContent = "Checking…";
      try {
        await squareApi.checkLink(link.id);
        await refreshSquareLinks();
        opts.onChange();
      } catch (err) {
        check.disabled = false;
        check.textContent = "Check with Square";
        window.alert(err.message);
      }
    });
    const group = document.createElement("div");
    group.className = "row-actions__group";
    group.append(copy, check);
    actions.append(group);
  }

  tr.append(
    cell(link.clientName || "—"),
    cell(link.description),
    cell(formatPence(link.amountPence)),
    tdStatus,
    cell(shortDate(link.createdAt)),
    actions
  );
  return tr;
}
