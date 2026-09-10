/**
 * Aria coach assistant — load only when Rachel opens chat (no auto pop-ups).
 */
import { computeInsights } from "./insights.js";
import { fetchBookings, fetchPayments } from "./api.js";

const ARIA_SERVER = "https://aria-chatbot-production-12d0.up.railway.app";
const BASE_PROMPT = `You are Aria, the private studio assistant for Rachel at The Skin Den (advanced skincare and acne specialist studio, Carlisle).
You help Rachel understand her admin dashboard: clients, treatment bookings, failed payments, and who to contact.
Tone: warm, clear, professional — like a trusted front desk manager. Never mention AireyAI or that you are a product demo.
Rules:
- Use only the LIVE DASHBOARD JSON appended below (full client list, bookings, payments when available).
- Flag failed payments, unpaid pending bookings, and clients who need follow-up as priorities.
- Suggest practical next steps (WhatsApp client, Bookings tab, finish Stripe setup) — you cannot click buttons yourself.
- Do not invent clients, amounts, or dates not in the JSON.
- Keep answers short unless they ask for detail.`;

let scriptEl = null;
let loadPromise = null;
let pendingSnapshot = null;
let pendingContact = null;

function memberRow(m) {
  return {
    id: m.id,
    name: m.name,
    email: m.email,
    plan: m.plan,
    planType: m.planType,
    status: m.status,
    renewalDate: m.renewalDate,
    lastPaymentStatus: m.lastPaymentStatus,
    lastPaymentAt: m.lastPaymentAt,
    packCredits: m.packCredits,
    lastClassAt: m.lastClassAt
  };
}

async function fetchLedgerExtras() {
  if (!window.KK_ADMIN_API_BASE) return { bookings: [], paymentEvents: [] };
  try {
    const [bookingsRes, paymentsRes] = await Promise.all([
      fetchBookings("all"),
      fetchPayments()
    ]);
    return {
      bookings: bookingsRes.bookings || [],
      paymentEvents: paymentsRes.events || []
    };
  } catch {
    return { bookings: [], paymentEvents: [] };
  }
}

function buildPayload(snapshot, extras) {
  const members = snapshot.members || [];
  const insights = computeInsights(members);
  return {
    updatedAt: new Date().toISOString(),
    mode: snapshot.mode,
    memberCount: members.length,
    revenue30d: snapshot.revenue || null,
    priorities: insights.map((i) => ({
      type: i.type,
      title: i.title,
      detail: i.detail,
      memberId: i.memberId
    })),
    members: members.map(memberRow),
    bookings: extras.bookings,
    paymentEvents: extras.paymentEvents
  };
}

function applyPrompt(payload) {
  const prompt = `${BASE_PROMPT}\n\nLIVE DASHBOARD JSON:\n${JSON.stringify(payload)}`;
  window.__ARIA_DASHBOARD_CONTEXT__ = payload;
  if (scriptEl) {
    scriptEl.dataset.prompt = prompt;
  }
  return prompt;
}

/** Refresh live dashboard JSON for Aria — does not mount the widget. */
export async function prepareAriaCoachContext(snapshot, contact) {
  if (!snapshot) return;
  pendingSnapshot = snapshot;
  pendingContact = contact || null;
  const extras = await fetchLedgerExtras();
  applyPrompt(buildPayload(snapshot, extras));
}

function waitForAriaChat(timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      if (window.AriaChat?.open) {
        resolve(window.AriaChat);
        return;
      }
      if (Date.now() - start > timeoutMs) {
        reject(new Error("Aria chat did not load — try again."));
        return;
      }
      setTimeout(tick, 50);
    };
    tick();
  });
}

function injectScript(prompt, contact) {
  if (scriptEl || document.getElementById("aria-coach-script")) {
    scriptEl = scriptEl || document.getElementById("aria-coach-script");
    return Promise.resolve();
  }

  const handoffEmail =
    contact?.email || window.SITE_CONFIG?.contact?.email || "rachel@theskinden.co.uk";
  const handoffWa = window.SITE_CONFIG?.contact?.phoneTel || "+447568602861";

  scriptEl = document.createElement("script");
  scriptEl.id = "aria-coach-script";
  scriptEl.src = `${ARIA_SERVER}/chatbot.js`;
  scriptEl.dataset.name = "Aria";
  scriptEl.dataset.slug = "the_skin_den";
  scriptEl.dataset.color = "#6F5938";
  scriptEl.dataset.server = ARIA_SERVER;
  scriptEl.dataset.endpoint = "/api/chat/router";
  scriptEl.dataset.streaming = "true";
  scriptEl.dataset.type = "salon";
  scriptEl.dataset.handoffEmail = handoffEmail;
  scriptEl.dataset.handoffWa = handoffWa;
  scriptEl.dataset.prompt = prompt;

  return new Promise((resolve, reject) => {
    scriptEl.addEventListener("load", () => resolve(), { once: true });
    scriptEl.addEventListener("error", () => reject(new Error("Could not load Aria chat.")), {
      once: true
    });
    document.body.append(scriptEl);
  });
}

/** Mount widget on demand; opens panel only when openPanel is true. */
export async function openAriaCoachChat({ openPanel = true } = {}) {
  if (pendingSnapshot) {
    await prepareAriaCoachContext(pendingSnapshot, pendingContact);
  }
  const prompt =
    scriptEl?.dataset.prompt ||
    `${BASE_PROMPT}\n\nLIVE DASHBOARD JSON:\n${JSON.stringify(window.__ARIA_DASHBOARD_CONTEXT__ || {})}`;

  if (!loadPromise) {
    loadPromise = injectScript(prompt, pendingContact).then(() => waitForAriaChat());
  }

  const api = await loadPromise;
  if (openPanel) api.open();
  return api;
}

export function initAriaOpenControl() {
  const btn = document.getElementById("aria-open-btn");
  if (!btn || btn.dataset.bound === "1") return;
  btn.dataset.bound = "1";
  btn.addEventListener("click", () => {
    btn.disabled = true;
    const label = btn.textContent;
    btn.textContent = "Opening…";
    void openAriaCoachChat({ openPanel: true })
      .catch((err) => {
        console.error(err);
        alert(err.message || "Could not open Aria chat.");
      })
      .finally(() => {
        btn.disabled = false;
        btn.textContent = label;
      });
  });
}

/** @deprecated use prepareAriaCoachContext + openAriaCoachChat */
export async function ensureAriaCoachAssistant(snapshot, contact) {
  await prepareAriaCoachContext(snapshot, contact);
}

export async function syncAriaDashboardContext(snapshot) {
  await prepareAriaCoachContext(snapshot, null);
}
