import {
  computeInsights,
  defaultOutreachMessage,
  whatsAppLink
} from "./insights.js";
import { markMemberContacted } from "./api.js";

export function createCopilot(options) {
  const { panel, messagesEl, inputEl, sendBtn, voiceBtn, onAction } = options;
  let members = [];
  let insights = [];

  function setContext(nextMembers) {
    members = nextMembers;
    insights = computeInsights(members);
    renderProactive();
  }

  function renderProactive() {
    const existing = panel.querySelector("[data-copilot-proactive]");
    if (existing) existing.remove();

    const block = document.createElement("div");
    block.className = "copilot-proactive";
    block.dataset.copilotProactive = "";

    const title = document.createElement("h3");
    title.className = "copilot-proactive-title";
    title.textContent = "Today's priorities";
    block.append(title);

    const top = insights.slice(0, 5);
    if (!top.length) {
      const empty = document.createElement("p");
      empty.className = "copilot-empty";
      empty.textContent = members.length
        ? "No urgent membership actions right now. You're on top of it."
        : "No members on file yet — priorities will appear when people join or pay online.";
      block.append(empty);
    } else {
      const list = document.createElement("ul");
      list.className = "copilot-priority-list";
      for (const item of top) {
        const member = members.find((m) => m.id === item.memberId);
        if (!member) continue;
        list.append(buildPriorityItem(item, member));
      }
      block.append(list);
    }

    panel.insertBefore(block, messagesEl);
  }

  function buildPriorityItem(item, member) {
    const li = document.createElement("li");
    li.className = "copilot-priority-item";

    const body = document.createElement("div");
    const strong = document.createElement("strong");
    strong.textContent = item.title;
    const p = document.createElement("p");
    p.textContent = item.detail;
    body.append(strong, p);

    const actions = document.createElement("div");
    actions.className = "copilot-priority-actions";

    const viewBtn = document.createElement("button");
    viewBtn.type = "button";
    viewBtn.className = "btn btn--small btn--ghost";
    viewBtn.textContent = "View";
    viewBtn.addEventListener("click", () => {
      onAction?.({ type: "open_member", memberId: member.id });
    });

    const waBtn = document.createElement("button");
    waBtn.type = "button";
    waBtn.className = "btn btn--small btn--primary";
    waBtn.textContent = "WhatsApp";
    waBtn.addEventListener("click", () => openWhatsApp(member, item));

    actions.append(viewBtn, waBtn);
    li.append(body, actions);
    return li;
  }

  function openWhatsApp(member, insight) {
    const msg = defaultOutreachMessage(member, insight);
    window.open(whatsAppLink(member.phone, msg), "_blank", "noopener,noreferrer");
    markMemberContacted(member.id);
    appendAssistant(
      `Opened WhatsApp for ${member.name}. I used a friendly chase message — edit before sending if you like.`
    );
    onAction?.({ type: "contacted", memberId: member.id });
  }

  function appendUser(text) {
    appendBubble("user", text);
  }

  function appendAssistant(text) {
    appendBubble("assistant", text);
  }

  function appendBubble(role, text) {
    const div = document.createElement("div");
    div.className = `copilot-msg copilot-msg--${role}`;
    div.textContent = text;
    messagesEl.append(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function answer(query) {
    const q = query.toLowerCase();

    if (/expir|renew|ending|running out/.test(q)) {
      const exp = insights.filter((i) =>
        ["expiring_soon", "payment_pending", "payment_failed"].includes(i.type)
      );
      if (!exp.length) {
        return "No subscriptions expiring in the next few days that need action.";
      }
      const lines = exp.slice(0, 6).map((i) => `• ${i.title}`);
      return `Here's who to contact first:\n${lines.join("\n")}\n\nUse the priority list above for one-tap WhatsApp.`;
    }

    if (/fail|declin|payment|card/.test(q)) {
      const failed = members.filter((m) => m.lastPaymentStatus === "failed");
      if (!failed.length) return "No failed payments on file right now.";
      return `Failed payments (${failed.length}):\n${failed.map((m) => `• ${m.name} — ${m.plan}`).join("\n")}\n\nMessage them today so they don't drop off mid-month.`;
    }

    if (/mrr|revenue|money|month/.test(q)) {
      const subs = members.filter((m) => m.planType === "subscription");
      const mrr = subs.reduce((s, m) => s + (m.mrrContribution || 0), 0);
      return `Estimated MRR from ${subs.length} subscription profiles: £${mrr.toFixed(2)} (from member records).`;
    }

    if (/pack|credit|class left/.test(q)) {
      const low = members.filter((m) => m.packCredits === 1);
      if (!low.length) return "Nobody is down to their last pack credit.";
      return `One class left:\n${low.map((m) => `• ${m.name}`).join("\n")}\n\nGood time to offer a 10-pack or unlimited.`;
    }

    if (/who|priority|today|chase|contact/.test(q)) {
      if (!insights.length) return "Clear queue — no urgent membership tasks.";
      return `Top ${Math.min(3, insights.length)} actions:\n${insights
        .slice(0, 3)
        .map((i) => `• ${i.title}`)
        .join("\n")}`;
    }

    if (/help|what can/.test(q)) {
      return `Ask me things like:\n• "Who is expiring this week?"\n• "Any failed payments?"\n• "Who needs chasing today?"\n• "Pack credits running low?"\n\nI can open WhatsApp with a draft message from the priority list.`;
    }

    return `Try "Who needs chasing today?" or "Any failed payments?" — or tap a priority card above.`;
  }

  function handleSend() {
    const text = inputEl.value.trim();
    if (!text) return;
    inputEl.value = "";
    appendUser(text);
    appendAssistant(answer(text));
  }

  sendBtn.addEventListener("click", handleSend);
  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  });

  if (voiceBtn && "webkitSpeechRecognition" in window) {
    const Rec = window.webkitSpeechRecognition;
    const rec = new Rec();
    rec.lang = "en-GB";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    voiceBtn.addEventListener("click", () => {
      voiceBtn.classList.add("is-listening");
      voiceBtn.setAttribute("aria-pressed", "true");
      rec.start();
    });
    rec.addEventListener("result", (event) => {
      inputEl.value = event.results[0][0].transcript;
      handleSend();
    });
    rec.addEventListener("end", () => {
      voiceBtn.classList.remove("is-listening");
      voiceBtn.setAttribute("aria-pressed", "false");
    });
    rec.addEventListener("error", () => {
      voiceBtn.classList.remove("is-listening");
      voiceBtn.setAttribute("aria-pressed", "false");
    });
  } else if (voiceBtn) {
    voiceBtn.hidden = true;
  }

  appendAssistant(
    "I'm your studio copilot. I watch renewals, failed payments, and pack balances. Ask who to contact today, or use the buttons on each priority."
  );

  return { setContext, openWhatsApp };
}
