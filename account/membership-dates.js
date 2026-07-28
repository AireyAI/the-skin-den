/** Member-facing membership dates, alerts, and fact rows. */

export function formatDate(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(String(iso).includes("T") ? iso : `${iso}T12:00:00`);
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return iso;
  }
}

export function formatStatus(raw) {
  const map = {
    active: "Active",
    lapsed: "Lapsed",
    paused: "Paused",
    pending: "Pending",
    expiring: "Expiring soon",
    payment_failed: "Payment issue"
  };
  return map[raw] || String(raw || "").replace(/_/g, " ") || "—";
}

function parseDay(iso) {
  if (!iso) return null;
  const d = new Date(String(iso).includes("T") ? iso : `${iso}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function daysUntil(iso) {
  const d = parseDay(iso);
  if (!d) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(d);
  target.setHours(0, 0, 0, 0);
  return Math.round((target - today) / 86400000);
}

export function daysUntilLabel(days) {
  if (days === null) return "";
  if (days < 0) return `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} ago`;
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
}

export function buildMembershipAlerts(m) {
  const alerts = [];
  if (!m) return alerts;

  if (m.lastPaymentStatus === "failed" || m.status === "payment_failed") {
    alerts.push({
      level: "urgent",
      title: "Payment failed",
      body: "Your last payment did not go through. Contact the studio so your membership stays active."
    });
  }

  if (m.status === "lapsed") {
    alerts.push({
      level: "urgent",
      title: "Membership lapsed",
      body: "Your plan is no longer active. Book a class or contact the studio to rejoin."
    });
  }

  if (m.planType === "subscription" && m.renewalDate) {
    const days = daysUntil(m.renewalDate);
    const when = formatDate(m.renewalDate);
    const rel = daysUntilLabel(days);
    if (m.autoRenew) {
      if (days !== null && days >= 0 && days <= 14) {
        alerts.push({
          level: days <= 3 ? "warn" : "info",
          title: "Renewal coming up",
          body: `Your plan renews on ${when} (${rel}). Auto-renew is on — no action needed unless you want to change anything.`
        });
      }
    } else if (days !== null && days < 0) {
      alerts.push({
        level: "urgent",
        title: "Membership ended",
        body: `Your plan expired on ${when}. Contact the studio to renew.`
      });
    } else if (days !== null && days <= 14) {
      alerts.push({
        level: days <= 7 ? "urgent" : "warn",
        title: "Membership expiring",
        body: `Your plan ends on ${when} (${rel}). Auto-renew is off — contact the studio to stay on the timetable.`
      });
    }
  }

  if (m.status === "expiring" && !alerts.some((a) => /expir/i.test(a.title))) {
    alerts.push({
      level: "warn",
      title: "Expiring soon",
      body: "Your membership is marked as expiring. Check the dates below or contact the studio."
    });
  }

  if (m.planType === "pack" || m.planType === "drop_in") {
    if (m.packExpiresAt) {
      const days = daysUntil(m.packExpiresAt);
      const when = formatDate(m.packExpiresAt);
      if (days !== null && days < 0) {
        alerts.push({
          level: "urgent",
          title: "Class pack expired",
          body: `Your pack expired on ${when}. Book a new session or ask about a new pack.`
        });
      } else if (days !== null && days <= 14) {
        alerts.push({
          level: days <= 7 ? "warn" : "info",
          title: "Class pack expiring",
          body: `Use your credits before ${when} (${daysUntilLabel(days)}).`
        });
      }
    }
    if (m.packCredits === 0) {
      alerts.push({
        level: "warn",
        title: "No credits left",
        body: "You have no class credits on this pack. Book a drop-in or contact the studio."
      });
    } else if (m.packCredits === 1) {
      alerts.push({
        level: "info",
        title: "Last credit",
        body: "You have 1 class credit left on this pack."
      });
    }
  }

  return alerts;
}

export function memberSummaryLine(m) {
  if (!m) {
    return "Sign in complete — your plan will appear here once the studio links your membership.";
  }
  if (m.planType === "subscription" && m.renewalDate) {
    const d = daysUntil(m.renewalDate);
    const rel = d !== null ? ` · ${daysUntilLabel(d)}` : "";
    return m.autoRenew
      ? `Renews ${formatDate(m.renewalDate)}${rel}`
      : `Expires ${formatDate(m.renewalDate)}${rel} · auto-renew off`;
  }
  if (m.packExpiresAt) {
    return `Pack expires ${formatDate(m.packExpiresAt)} · ${m.packCredits ?? 0} credit${m.packCredits === 1 ? "" : "s"} left`;
  }
  return m.plan || "Your membership details are below.";
}

function appendAlert(wrap, level, title, body) {
  const el = document.createElement("div");
  el.className = `member-alert member-alert--${level}`;
  const t = document.createElement("p");
  t.className = "member-alert__title";
  t.textContent = title;
  const b = document.createElement("p");
  b.className = "member-alert__body";
  b.textContent = body;
  el.append(t, b);
  wrap.append(el);
}

export function renderMemberAlerts(m, { signedIn = false, membershipPending = false } = {}) {
  const wrap = document.getElementById("member-alerts");
  if (!wrap) return;
  wrap.replaceChildren();
  if (!m && signedIn) {
    // membershipPending means a paid plan exists on this email but is not linked to
    // this login. Saying "no membership" there reads as the studio losing their money.
    if (membershipPending) {
      appendAlert(
        wrap,
        "warn",
        "We found a purchase on this email",
        "For your security it is only linked automatically when you sign in with Google or Apple. Sign in that way, or ask the studio to connect it to this account."
      );
    } else {
      appendAlert(
        wrap,
        "info",
        "No membership linked yet",
        "If you already train with us, the studio connects your plan to this email. Book a class or contact the studio if dates or credits look wrong."
      );
    }
    wrap.hidden = false;
    return;
  }
  const alerts = buildMembershipAlerts(m);
  if (!m) {
    wrap.hidden = true;
    return;
  }
  if (!alerts.length && m.planType === "subscription" && m.renewalDate && m.autoRenew) {
    const days = daysUntil(m.renewalDate);
    if (days === null || days > 14) {
      appendAlert(
        wrap,
        "ok",
        "You’re all set",
        `Next renewal on ${formatDate(m.renewalDate)}. Auto-renew is on.`
      );
      wrap.hidden = false;
      return;
    }
  }
  if (!alerts.length && m.packExpiresAt && (m.planType === "pack" || m.planType === "drop_in")) {
    const days = daysUntil(m.packExpiresAt);
    if (days !== null && days > 14) {
      appendAlert(
        wrap,
        "ok",
        "You’re all set",
        `Pack expires ${formatDate(m.packExpiresAt)} · ${m.packCredits ?? 0} credit${m.packCredits === 1 ? "" : "s"} left.`
      );
      wrap.hidden = false;
      return;
    }
  }
  wrap.hidden = !alerts.length;
  for (const a of alerts) appendAlert(wrap, a.level, a.title, a.body);
}

function factRow(label, value, rowClass = "") {
  const dt = document.createElement("dt");
  dt.textContent = label;
  const dd = document.createElement("dd");
  dd.textContent = value;
  const row = document.createElement("div");
  if (rowClass) row.className = rowClass;
  row.append(dt, dd);
  return row;
}

export function renderMembershipFacts(m, factsEl) {
  factsEl.replaceChildren();
  if (!m) {
    factsEl.append(factRow("Membership", "No plan linked yet — book a class or ask the studio after you purchase."));
    return;
  }

  const paymentFailed = m.lastPaymentStatus === "failed" || m.status === "payment_failed";
  const isSub = m.planType === "subscription";
  const isPack = m.planType === "pack" || m.planType === "drop_in";

  factsEl.append(factRow("Plan", m.plan || "—"));
  factsEl.append(factRow("Status", formatStatus(m.status)));

  if (isSub) {
    if (m.renewalDate) {
      const label = m.autoRenew ? "Renews on" : "Expires on";
      const days = daysUntil(m.renewalDate);
      const extra = days !== null ? ` (${daysUntilLabel(days)})` : "";
      factsEl.append(
        factRow(label, `${formatDate(m.renewalDate)}${extra}`, days !== null && days <= 7 ? "acct-fact--warn" : "")
      );
    } else {
      factsEl.append(factRow("Renewal / expiry", "Not set yet — ask the studio if you expect a date here"));
    }
    factsEl.append(
      factRow("Auto-renew", m.autoRenew ? "On — renews automatically" : "Off — renew manually before expiry")
    );
  }

  if (isPack || m.packCredits != null) {
    factsEl.append(
      factRow("Credits left", m.packCredits != null ? String(m.packCredits) : "—", m.packCredits === 0 ? "acct-fact--warn" : "")
    );
    if (m.packExpiresAt) {
      const days = daysUntil(m.packExpiresAt);
      factsEl.append(
        factRow(
          "Pack expires",
          `${formatDate(m.packExpiresAt)}${days !== null ? ` (${daysUntilLabel(days)})` : ""}`,
          days !== null && days <= 7 ? "acct-fact--warn" : ""
        )
      );
    } else if (isPack) {
      factsEl.append(factRow("Pack expires", "No expiry date on file — ask the studio if your pack is time-limited"));
    }
  }

  if (m.lastPaymentAt) factsEl.append(factRow("Last payment", formatDate(m.lastPaymentAt)));

  factsEl.append(
    factRow(
      "Payment status",
      paymentFailed ? "Failed — contact the studio to update your details" : "Up to date",
      paymentFailed ? "acct-fact--warn" : ""
    )
  );

  if (m.lastClassAt) factsEl.append(factRow("Last class attended", formatDate(m.lastClassAt)));
  if (m.joinedAt) factsEl.append(factRow("Member since", formatDate(m.joinedAt)));
}
