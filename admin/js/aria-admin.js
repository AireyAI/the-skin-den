/**
 * Aria coach assistant — shared Railway chatbot with live dashboard context.
 */
import { computeInsights } from "./insights.js";
import { fetchBookings, fetchPayments } from "./api.js";

const ARIA_SERVER = "https://aria-chatbot-production-12d0.up.railway.app";
const BASE_PROMPT = `You are Aria, the private studio assistant for Rachel at The Skin Den (advanced skincare and acne specialist studio, Carlisle).
You help the coach understand their admin dashboard: memberships, renewals, failed payments, class bookings, and who to contact.
Tone: warm, clear, professional — like a trusted front desk manager. Never mention AireyAI or that you are a product demo.
Rules:
- Use only the LIVE DASHBOARD JSON appended below (full member list, bookings, payments when available).
- Flag failed payments, expiring memberships, low pack credits, and unpaid pending bookings as priorities.
- Suggest practical next steps (WhatsApp member, Bookings tab, finish Stripe setup) — you cannot click buttons yourself.
- Do not invent members, amounts, or dates not in the JSON.
- Keep answers short unless they ask for detail.`;

let scriptEl = null;

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

/** Load or refresh Aria context; mounts the bubble once on first login. */
export async function ensureAriaCoachAssistant(snapshot, contact) {
  if (!snapshot) return;
  const extras = await fetchLedgerExtras();
  const prompt = applyPrompt(buildPayload(snapshot, extras));

  if (scriptEl || document.getElementById("aria-coach-script")) return;

  const handoffEmail =
    contact?.email || window.SITE_CONFIG?.contact?.email || "rachel@theskinden.co.uk";
  const handoffWa = window.SITE_CONFIG?.contact?.phoneTel || "+447436496863";

  scriptEl = document.createElement("script");
  scriptEl.id = "aria-coach-script";
  scriptEl.src = `${ARIA_SERVER}/chatbot.js`;
  scriptEl.dataset.name = "Aria";
  scriptEl.dataset.slug = "the_skin_den";
  scriptEl.dataset.color = "#3ef0d4";
  scriptEl.dataset.server = ARIA_SERVER;
  scriptEl.dataset.endpoint = "/api/chat/router";
  scriptEl.dataset.streaming = "true";
  scriptEl.dataset.type = "fitness";
  scriptEl.dataset.handoffEmail = handoffEmail;
  scriptEl.dataset.handoffWa = handoffWa;
  scriptEl.dataset.prompt = prompt;

  document.body.append(scriptEl);
}

export async function syncAriaDashboardContext(snapshot) {
  if (!snapshot) return;
  const extras = await fetchLedgerExtras();
  applyPrompt(buildPayload(snapshot, extras));
}
