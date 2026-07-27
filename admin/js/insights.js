import { daysUntil } from "./api.js";

const MS_PER_DAY = 86400000;

export function enrichMember(member) {
  const renewalIn = daysUntil(member.renewalDate);
  const packExpiresIn = daysUntil(member.packExpiresAt);
  return { ...member, renewalIn, packExpiresIn };
}

export function computeInsights(members) {
  const enriched = members.map(enrichMember);
  const insights = [];

  for (const m of enriched) {
    if (m.lastPaymentStatus === "failed") {
      insights.push({
        id: `pay-fail-${m.id}`,
        priority: 1,
        type: "payment_failed",
        memberId: m.id,
        title: `Payment failed — ${m.name}`,
        detail: `${m.plan}. Last attempt failed. Reach out before access lapses.`,
        suggestedAction: "whatsapp",
        urgency: "today"
      });
      continue;
    }

    if (m.lastPaymentStatus === "pending" && m.planType === "subscription") {
      insights.push({
        id: `pay-pending-${m.id}`,
        priority: 2,
        type: "payment_pending",
        memberId: m.id,
        title: `Renewal payment pending — ${m.name}`,
        detail: `Renews ${formatShort(m.renewalDate)} (${m.renewalIn} days). No successful charge yet.`,
        suggestedAction: "whatsapp",
        urgency: "today"
      });
    }

    if (
      m.planType === "subscription" &&
      m.renewalIn !== null &&
      m.renewalIn <= 3 &&
      m.renewalIn >= 0 &&
      !m.autoRenew
    ) {
      insights.push({
        id: `expiring-${m.id}`,
        priority: 2,
        type: "expiring_soon",
        memberId: m.id,
        title: `Membership ends in ${m.renewalIn} day${m.renewalIn === 1 ? "" : "s"} — ${m.name}`,
        detail: "Auto-renew is off. Offer to restart or switch to a pack.",
        suggestedAction: "whatsapp",
        urgency: m.renewalIn <= 1 ? "today" : "this_week"
      });
    }

    if (m.planType === "pack" && m.packCredits === 1) {
      insights.push({
        id: `pack-low-${m.id}`,
        priority: 3,
        type: "pack_low",
        memberId: m.id,
        title: `1 class left — ${m.name}`,
        detail: m.packExpiresAt
          ? `Pack expires ${formatShort(m.packExpiresAt)} (${m.packExpiresIn} days).`
          : "Suggest a 10-class pack or unlimited.",
        suggestedAction: "whatsapp",
        urgency: "this_week"
      });
    }

    if (m.status === "lapsed" && m.lastClassAt) {
      const last = new Date(`${m.lastClassAt}T12:00:00`);
      const daysSince = Math.floor((Date.now() - last) / MS_PER_DAY);
      if (daysSince >= 30) {
        insights.push({
          id: `lapsed-${m.id}`,
          priority: 4,
          type: "lapsed",
          memberId: m.id,
          title: `Win-back — ${m.name}`,
          detail: `No visit in ${daysSince} days. Last plan: ${m.plan}.`,
          suggestedAction: "whatsapp",
          urgency: "when_you_can"
        });
      }
    }
  }

  insights.sort((a, b) => a.priority - b.priority);
  return insights;
}

export function computeKpis(members) {
  const subs = members.filter((m) => m.planType === "subscription");
  const activeSubs = subs.filter((m) => m.status === "active" || m.status === "expiring");
  const mrr = subs.reduce((sum, m) => {
    if (m.lastPaymentStatus === "failed") return sum;
    return sum + (m.mrrContribution || 0);
  }, 0);
  const failed = members.filter((m) => m.lastPaymentStatus === "failed").length;
  const expiring7 = members.filter((m) => {
    const d = daysUntil(m.renewalDate);
    return d !== null && d >= 0 && d <= 7 && m.planType === "subscription";
  }).length;
  const packLow = members.filter((m) => m.packCredits === 1).length;

  return {
    totalMembers: members.length,
    activeSubscriptions: activeSubs.length,
    mrr,
    paymentFailures: failed,
    expiringWithin7: expiring7,
    packAlmostEmpty: packLow
  };
}

export function filterMembers(members, filter) {
  if (filter === "all") return members;
  if (filter === "attention") {
    const ids = new Set(computeInsights(members).map((i) => i.memberId));
    return members.filter((m) => ids.has(m.id));
  }
  return members.filter((m) => {
    if (filter === "subscription") return m.planType === "subscription";
    if (filter === "pack") return m.planType === "pack";
    if (filter === "failed") return m.lastPaymentStatus === "failed";
    if (filter === "expiring") return m.status === "expiring" || (daysUntil(m.renewalDate) !== null && daysUntil(m.renewalDate) <= 7);
    return m.status === filter;
  });
}

function formatShort(iso) {
  if (!iso) return "—";
  return new Date(`${iso}T12:00:00`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short"
  });
}

export function whatsAppLink(phone, message) {
  const digits = phone.replace(/\D/g, "");
  const text = encodeURIComponent(message);
  return `https://wa.me/${digits}?text=${text}`;
}

export function defaultOutreachMessage(member, insight) {
  const first = member.name.split(" ")[0];
  if (insight?.type === "payment_failed") {
    return `Hi ${first}, it's Rachel at The Skin Den. Your payment didn't go through — want me to help you update your card so you don't lose your spot?`;
  }
  if (insight?.type === "expiring_soon" || insight?.type === "payment_pending") {
    return `Hi ${first}, your treatment plan renews soon. Want to book your next session or adjust your plan? Happy to help.`;
  }
  if (insight?.type === "pack_low") {
    return `Hi ${first}, you've got one class left on your pack. Want to top up with another pack or try unlimited?`;
  }
  if (insight?.type === "lapsed") {
    return `Hi ${first}, we've missed you at Atlas Works. Fancy coming back for a session? First visit back we'd love to see you in the room.`;
  }
  return `Hi ${first}, it's Rachel at The Skin Den — just checking in. Can I help with your membership or booking?`;
}
