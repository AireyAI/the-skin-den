import { randomUUID } from "node:crypto";
import { getDb, getMember, membershipForUser, upsertMember } from "./db.mjs";
import { authMiddleware } from "./auth-routes.mjs";
import { mintCheckinToken, checkinQrUrl, parseCheckinScanDetailed } from "./checkin-token.mjs";
import { config } from "./config.mjs";

const DEDUPE_MS = 20 * 60 * 1000;

/**
 * Statuses that may pass the door, as an allowlist.
 *
 * This used to be a denylist of "cancelled" and "expired" — neither of which the
 * Stripe webhook ever writes. A member who cancelled became "lapsed" and kept
 * walking in free, and the scanner told the coach they were unlimited. Anything not
 * named here is refused, and the coach can still wave someone through with an
 * override that gets logged.
 */
const ALLOWED_STATUSES = new Set(["active", "expiring", "pack_low", "trialing"]);

/** Allowed, but the coach should know the card is failing. */
const WARN_STATUSES = new Set(["payment_failed", "past_due"]);

const STATUS_REASONS = {
  lapsed: "Membership has lapsed — the subscription was cancelled.",
  cancelled: "Membership was cancelled.",
  expired: "Membership has expired.",
  unpaid: "Membership is unpaid.",
  incomplete: "Membership was never completed at checkout.",
  incomplete_expired: "Membership was never completed at checkout."
};

function isPackMember(m) {
  if (!m) return false;
  if (m.planType === "pack") return true;
  return m.packCredits != null && m.planType !== "subscription";
}

function isUnlimitedMember(m) {
  if (!m) return false;
  if (m.planType === "unlimited") return true;
  if (m.planType === "subscription" && ALLOWED_STATUSES.has(m.status)) return true;
  return false;
}

/** @returns {{blocked: string|null, warning: string|null}} */
function assessMembership(m) {
  if (!m) {
    return { blocked: "No membership on file — link them from the admin Members tab.", warning: null };
  }
  const status = String(m.status || "").toLowerCase();
  const warned = WARN_STATUSES.has(status);
  if (!ALLOWED_STATUSES.has(status) && !warned) {
    return {
      blocked: STATUS_REASONS[status] || `Membership is not active (status: ${m.status || "unknown"}).`,
      warning: null
    };
  }
  if (m.packExpiresAt) {
    const exp = new Date(`${m.packExpiresAt}T23:59:59`);
    if (exp < new Date()) return { blocked: "Class pack has expired.", warning: null };
  }
  if (isPackMember(m) && (m.packCredits ?? 0) <= 0) {
    return { blocked: "No classes left on this pack.", warning: null };
  }
  return {
    blocked: null,
    warning: warned ? "Last payment failed — ask them to update their card." : null
  };
}

function recordCheckIn(database, row) {
  database
    .prepare(
      `INSERT INTO check_ins (
        id, member_id, user_id, coach_id, scanned_at, credits_before, credits_after,
        deducted, result, scan_raw
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      row.id,
      row.memberId,
      row.userId,
      row.coachId,
      row.scannedAt,
      row.creditsBefore,
      row.creditsAfter,
      row.deducted ? 1 : 0,
      row.result,
      row.scanRaw?.slice(0, 512) || null
    );
}

function recentDuplicate(database, memberId) {
  const since = new Date(Date.now() - DEDUPE_MS).toISOString();
  return database
    .prepare(
      `SELECT * FROM check_ins
       WHERE member_id = ? AND scanned_at >= ? AND result = 'ok'
       ORDER BY scanned_at DESC LIMIT 1`
    )
    .get(memberId, since);
}

export function performCheckIn({
  database,
  member,
  coachId,
  scanRaw,
  allowDuplicate = false,
  override = false,
  overrideReason = ""
}) {
  const { blocked, warning } = assessMembership(member);
  if (blocked && !override) {
    // Refusals are part of the audit trail. The original code returned here without
    // recording anything, so check_ins only ever held successful scans and there was
    // no evidence of who was turned away or why.
    recordCheckIn(database, {
      id: randomUUID(),
      memberId: member?.id || "unknown",
      userId: member?.userId || null,
      coachId,
      scannedAt: new Date().toISOString(),
      creditsBefore: member?.packCredits ?? null,
      creditsAfter: member?.packCredits ?? null,
      deducted: false,
      result: "refused",
      scanRaw
    });
    return {
      ok: false,
      status: 403,
      error: blocked,
      canOverride: Boolean(member),
      member: summarizeMember(member)
    };
  }

  const dup = !allowDuplicate ? recentDuplicate(database, member.id) : null;
  if (dup) {
    const current = getMember(database, member.id);
    return {
      ok: true,
      status: 200,
      alreadyCheckedIn: true,
      message: "Already checked in recently — no second class deducted.",
      member: summarizeMember(current),
      checkInId: dup.id
    };
  }

  const now = new Date().toISOString();
  const before = member.packCredits;
  let after = before;
  let deducted = false;

  if (isPackMember(member) && !isUnlimitedMember(member)) {
    after = Math.max(0, (member.packCredits ?? 0) - 1);
    deducted = before !== after;
    member = { ...member, packCredits: after, lastClassAt: now };
    upsertMember(database, member);
  } else {
    member = { ...member, lastClassAt: now };
    upsertMember(database, member);
  }

  const id = randomUUID();
  recordCheckIn(database, {
    id,
    memberId: member.id,
    userId: member.userId,
    coachId,
    scannedAt: now,
    creditsBefore: before ?? null,
    creditsAfter: after ?? null,
    deducted,
    result: override && blocked ? "override" : "ok",
    scanRaw: override && overrideReason ? `${scanRaw || ""} | override: ${overrideReason}` : scanRaw
  });

  const base = deducted
    ? `Checked in — ${after} class${after === 1 ? "" : "es"} left.`
    : "Checked in — unlimited membership.";
  return {
    ok: true,
    status: 200,
    checkInId: id,
    deducted,
    overridden: Boolean(override && blocked),
    warning: warning || (override && blocked ? `Override: ${blocked}` : null),
    message: override && blocked ? `Checked in by override — ${blocked}` : base,
    member: summarizeMember(getMember(database, member.id))
  };
}

function summarizeMember(m) {
  if (!m) return null;
  return {
    id: m.id,
    name: m.name,
    email: m.email,
    plan: m.plan,
    planType: m.planType,
    status: m.status,
    packCredits: m.packCredits,
    packExpiresAt: m.packExpiresAt,
    lastClassAt: m.lastClassAt
  };
}

export async function getMemberCheckInQr(req) {
  const auth = authMiddleware("member")(req);
  if (auth.error) return { status: auth.status, json: { error: auth.error } };

  const database = getDb();
  const user = database.prepare("SELECT id, email, name FROM users WHERE id = ?").get(auth.payload.sub);
  if (!user) return { status: 404, json: { error: "User not found" } };

  const membership = membershipForUser(database, user.id);
  const { walletBarcodeForPass } = await import("./wallet-pass.mjs");
  const { qrPngDataUri } = await import("./qr-image.mjs");

  if (!membership?.id) {
    const qrUrl = walletBarcodeForPass({ user, membership: null });
    return {
      status: 200,
      json: {
        qrUrl,
        qrImage: await qrPngDataUri(qrUrl),
        preview: true,
        message:
          "Add a plan for door check-in. This QR opens your account — same as the pass before a plan is linked."
      }
    };
  }

  const token = mintCheckinToken({ memberId: membership.id, userId: user.id });
  const qrUrl = checkinQrUrl(token);

  return {
    status: 200,
    json: {
      qrUrl,
      token,
      qrImage: await qrPngDataUri(qrUrl),
      expiresInSec: config.checkinTokenTtlSec,
      memberId: membership.id,
      classesRemaining: membership.packCredits,
      unlimited: isUnlimitedMember(membership),
      plan: membership.plan,
      preview: false
    }
  };
}

export async function postAdminCheckIn(req, body) {
  const auth = authMiddleware("coach")(req);
  if (auth.error) return { status: auth.status, json: { error: auth.error } };

  const raw = body?.token || body?.scan || body?.qr || body?.payload;
  if (!raw) return { status: 400, json: { error: "Missing scan payload (token or QR URL)." } };

  const { payload: parsed, reason } = parseCheckinScanDetailed(String(raw));
  if (!parsed) {
    const message =
      reason === "expired"
        ? "This code has expired — ask them to reopen their account page for a fresh one."
        : reason === "outdated"
          ? "This code is from an older app version — ask them to reopen their account page."
          : "Invalid or tampered check-in code.";
    return { status: 400, json: { error: message, reason } };
  }

  const database = getDb();
  const member = getMember(database, parsed.m);
  if (!member) return { status: 404, json: { error: "Member not found." } };
  if (member.userId && member.userId !== parsed.u) {
    return { status: 403, json: { error: "Check-in code does not match this membership." } };
  }

  const result = performCheckIn({
    database,
    member,
    coachId: auth.payload.sub,
    scanRaw: String(raw),
    override: body?.override === true,
    overrideReason: String(body?.overrideReason || "").slice(0, 120)
  });

  if (!result.ok) {
    return {
      status: result.status,
      json: { error: result.error, canOverride: result.canOverride, member: result.member }
    };
  }

  // Refresh Google Wallet pass balance when configured
  try {
    const { isGoogleWalletEnabled, upsertGoogleWalletObject } = await import("./google-wallet.mjs");
    const fresh = result.member?.id ? getMember(database, result.member.id) : null;
    if (isGoogleWalletEnabled() && fresh?.userId) {
      const user = database.prepare("SELECT * FROM users WHERE id = ?").get(fresh.userId);
      if (user) await upsertGoogleWalletObject({ user, membership: fresh });
    }
  } catch {
    /* wallet refresh is best-effort */
  }

  return {
    status: result.status,
    json: {
      ok: true,
      alreadyCheckedIn: result.alreadyCheckedIn || false,
      deducted: result.deducted || false,
      overridden: result.overridden || false,
      warning: result.warning || null,
      message: result.message,
      checkInId: result.checkInId,
      member: result.member
    }
  };
}

export function getAdminCheckIns(req) {
  const auth = authMiddleware("coach")(req);
  if (auth.error) return { status: auth.status, json: { error: auth.error } };

  const database = getDb();
  const rows = database
    .prepare(
      `SELECT c.*, m.name AS member_name, m.plan
       FROM check_ins c
       LEFT JOIN memberships m ON m.member_id = c.member_id
       ORDER BY c.scanned_at DESC LIMIT 80`
    )
    .all();

  return {
    status: 200,
    json: {
      checkIns: rows.map((r) => ({
        id: r.id,
        memberId: r.member_id,
        memberName: r.member_name,
        plan: r.plan,
        scannedAt: r.scanned_at,
        creditsBefore: r.credits_before,
        creditsAfter: r.credits_after,
        deducted: !!r.deducted,
        result: r.result,
        refused: r.result === "refused",
        overridden: r.result === "override"
      }))
    }
  };
}
