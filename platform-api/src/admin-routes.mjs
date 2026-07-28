import { randomUUID } from "node:crypto";
import { getDb, listMembers, markContacted, getMember, upsertMember } from "./db.mjs";
import { authMiddleware } from "./auth-routes.mjs";
import { listBackups, runBackup, backupDir } from "./backup.mjs";
import {
  listBookings,
  bookingRevenueSummary,
  listPaymentEvents
} from "./bookings-db.mjs";
import { getConnectStatus } from "./stripe-status.mjs";
import { config } from "./config.mjs";
import { getScheduleDocument } from "./schedule.mjs";
import { getWebsiteAnalyticsSummary } from "./ga4-analytics.mjs";

function studioActivity(database) {
  const since7 = new Date(Date.now() - 7 * 86400000).toISOString();
  const paid7 =
    database
      .prepare(
        `SELECT COUNT(*) AS c FROM class_bookings WHERE status = 'paid' AND COALESCE(updated_at, created_at) >= ?`
      )
      .get(since7)?.c || 0;
  const pending =
    database.prepare(`SELECT COUNT(*) AS c FROM class_bookings WHERE status = 'pending'`).get()?.c || 0;
  const lastPaid =
    database
      .prepare(
        `SELECT MAX(COALESCE(updated_at, created_at)) AS t FROM class_bookings WHERE status = 'paid'`
      )
      .get()?.t || null;
  const payments7 =
    database
      .prepare(`SELECT COUNT(*) AS c FROM payment_events WHERE created_at >= ?`)
      .get(since7)?.c || 0;
  return {
    paidBookings7d: paid7,
    pendingCheckouts: pending,
    paymentsRecorded7d: payments7,
    lastClassPaymentAt: lastPaid
  };
}

export async function getAdminDashboard(req) {
  const auth = authMiddleware("coach")(req);
  if (auth.error) return { status: auth.status, json: { error: auth.error } };
  const database = getDb();
  const members = listMembers(database)
    .filter((m) => !/@example\.(com|net)$/i.test(String(m.email || "").trim()))
    .map((m) => ({
    ...m,
    contactedAt: m.contactedAt || null
  }));
  const revenue = bookingRevenueSummary(database, 30);
  const schedule = getScheduleDocument();
  const activity = studioActivity(database);
  const websiteAnalytics = await getWebsiteAnalyticsSummary();
  return {
    status: 200,
    json: {
      mode: "live",
      tenant: config.tenantSlug,
      generatedAt: new Date().toISOString(),
      currency: "GBP",
      members,
      revenue,
      memberCount: members.length,
      activity,
      websiteAnalytics,
      schedule: {
        venue: schedule.venue || "",
        cancelPolicy: schedule.cancelPolicy || "",
        offerings: schedule.offerings || []
      },
      publicSiteOrigin: config.publicSiteOrigin
    }
  };
}

export function getAdminBookings(req) {
  const auth = authMiddleware("coach")(req);
  if (auth.error) return { status: auth.status, json: { error: auth.error } };
  const url = new URL(req.url || "/", "http://local");
  const status = url.searchParams.get("status") || "all";
  const database = getDb();
  return {
    status: 200,
    json: {
      bookings: listBookings(database, { status: status === "all" ? undefined : status }),
      revenue: bookingRevenueSummary(database, 30)
    }
  };
}

export function getAdminPayments(req) {
  const auth = authMiddleware("coach")(req);
  if (auth.error) return { status: auth.status, json: { error: auth.error } };
  const database = getDb();
  return {
    status: 200,
    json: {
      events: listPaymentEvents(database, 150),
      revenue: bookingRevenueSummary(database, 30)
    }
  };
}

export async function getAdminStripeStatus(req) {
  const auth = authMiddleware("coach")(req);
  if (auth.error) return { status: auth.status, json: { error: auth.error } };
  // The coach opens this screen precisely to check whether onboarding just landed,
  // so this one bypasses the cache.
  const status = await getConnectStatus({ fresh: true });
  const connectAccountId = (await import("./tenant-settings.mjs")).getStripeConnectAccountId();
  const paymentsLive = !!status.readyForCheckout;
  return {
    status: 200,
    json: {
      ...status,
      paymentsLive,
      connectAccountId: connectAccountId || null,
      connectAccountLabel: connectAccountId
        ? `Kettle Kulture Stripe account ····${connectAccountId.slice(-6)}`
        : null,
      coachHeadline: paymentsLive
        ? "Online payments are live"
        : status.detailsSubmitted
          ? "Finish Stripe setup"
          : "Connect your bank to get paid online",
      coachDetail: paymentsLive
        ? "Class bookings and packs can be paid on the website. Money goes to your connected bank (Stripe handles card fees). You do not need to set anything up again — use “View Stripe dashboard” only if you want payout history."
        : status.message,
      platformFeeBps: config.platformFeeBps,
      webhookConfigured: Boolean(config.stripeWebhookSecret),
      publicSiteOrigin: config.publicSiteOrigin
    }
  };
}

export function postMemberContacted(req, memberId) {
  const auth = authMiddleware("coach")(req);
  if (auth.error) return { status: auth.status, json: { error: auth.error } };
  const database = getDb();
  const existing = getMember(database, memberId);
  if (!existing) return { status: 404, json: { error: "Member not found" } };
  const updated = markContacted(database, memberId);
  return { status: 200, json: { member: updated } };
}

/**
 * Attach a membership to a member's login.
 *
 * The door refusal message has always said "link them in admin", but there was no
 * way to do it — the only linking path was an automatic email match at sign-in, and
 * that is exactly the thing that let strangers claim memberships. This is the manual
 * route: the coach decides, and it is recorded against their id.
 */
export function postMemberLink(req, memberId, body) {
  const auth = authMiddleware("coach")(req);
  if (auth.error) return { status: auth.status, json: { error: auth.error } };
  const database = getDb();
  const member = getMember(database, memberId);
  if (!member) return { status: 404, json: { error: "Member not found" } };

  const userId = (body?.userId || "").trim();
  const userEmail = (body?.userEmail || "").trim().toLowerCase();
  if (!userId && !userEmail) {
    return { status: 400, json: { error: "userId or userEmail required" } };
  }
  const user = userId
    ? database.prepare("SELECT id, email FROM users WHERE id = ?").get(userId)
    : database.prepare("SELECT id, email FROM users WHERE lower(email) = lower(?)").get(userEmail);
  if (!user) {
    return { status: 404, json: { error: "No account with that email has signed up yet." } };
  }

  const clash = database
    .prepare("SELECT member_id FROM memberships WHERE user_id = ? AND member_id != ?")
    .get(user.id, memberId);
  if (clash) {
    return {
      status: 409,
      json: { error: `That account is already linked to membership ${clash.member_id}. Unlink it first.` }
    };
  }

  upsertMember(database, { ...member, userId: user.id });
  console.log(`[platform-api] coach ${auth.payload.sub} linked ${memberId} -> ${user.id}`);
  return { status: 200, json: { member: getMember(database, memberId), user: { id: user.id, email: user.email } } };
}

export function postMemberUnlink(req, memberId) {
  const auth = authMiddleware("coach")(req);
  if (auth.error) return { status: auth.status, json: { error: auth.error } };
  const database = getDb();
  const member = getMember(database, memberId);
  if (!member) return { status: 404, json: { error: "Member not found" } };
  upsertMember(database, { ...member, userId: null });
  console.log(`[platform-api] coach ${auth.payload.sub} unlinked ${memberId}`);
  return { status: 200, json: { member: getMember(database, memberId) } };
}

/** Manual credit correction — refunds, comps, or fixing a mis-scan at the door. */
export function postMemberCredits(req, memberId, body) {
  const auth = authMiddleware("coach")(req);
  if (auth.error) return { status: auth.status, json: { error: auth.error } };
  const database = getDb();
  const member = getMember(database, memberId);
  if (!member) return { status: 404, json: { error: "Member not found" } };

  const delta = Number(body?.delta);
  const setTo = body?.setTo === null || body?.setTo === undefined ? null : Number(body.setTo);
  if (!Number.isFinite(delta) && setTo === null) {
    return { status: 400, json: { error: "delta or setTo required" } };
  }
  const next =
    setTo !== null && Number.isFinite(setTo)
      ? Math.max(0, Math.round(setTo))
      : Math.max(0, Math.round((member.packCredits ?? 0) + delta));

  const patch = { ...member, packCredits: next };
  if (body?.packExpiresAt !== undefined) patch.packExpiresAt = body.packExpiresAt || null;
  if (body?.note) patch.notes = `${member.notes ? `${member.notes}\n` : ""}${body.note}`.slice(0, 2000);
  upsertMember(database, patch);
  console.log(
    `[platform-api] coach ${auth.payload.sub} set credits on ${memberId}: ${member.packCredits} -> ${next}`
  );
  return { status: 200, json: { member: getMember(database, memberId) } };
}

/** Add someone who paid in cash at the door. */
export function postAdminMember(req, body) {
  const auth = authMiddleware("coach")(req);
  if (auth.error) return { status: auth.status, json: { error: auth.error } };
  const email = (body?.email || "").trim().toLowerCase();
  const name = (body?.name || "").trim();
  if (!email || !name) return { status: 400, json: { error: "name and email are required" } };

  const database = getDb();
  const clash = database
    .prepare("SELECT member_id FROM memberships WHERE lower(email) = lower(?)")
    .get(email);
  if (clash) {
    return { status: 409, json: { error: `That email already belongs to ${clash.member_id}.` } };
  }

  const planType = body.planType === "subscription" ? "subscription" : body.planType === "pack" ? "pack" : "drop_in";
  const credits = Number(body.packCredits);
  const today = new Date().toISOString().slice(0, 10);
  const member = {
    id: `mem_${randomUUID().slice(0, 10)}`,
    userId: null,
    name,
    email,
    phone: (body.phone || "").trim(),
    plan: body.plan || (planType === "subscription" ? "Monthly membership" : planType === "pack" ? "Class pack" : "Drop-in / class pay"),
    planType,
    status: "active",
    renewalDate: body.renewalDate || null,
    autoRenew: false,
    lastPaymentStatus: "ok",
    lastPaymentAt: new Date().toISOString(),
    mrrContribution: Number(body.mrrContribution) || 0,
    packCredits: planType === "pack" && Number.isFinite(credits) ? Math.max(0, Math.round(credits)) : null,
    packExpiresAt: body.packExpiresAt || null,
    joinedAt: today,
    lastClassAt: null,
    notes: body.notes || "Added manually by the studio.",
    contactedAt: null,
    stripeCustomerId: null
  };
  upsertMember(database, member);
  console.log(`[platform-api] coach ${auth.payload.sub} created member ${member.id}`);
  return { status: 201, json: { member: getMember(database, member.id) } };
}

/** Unlinked accounts and unclaimed memberships, so the coach can pair them up. */
export function getAdminUnlinked(req) {
  const auth = authMiddleware("coach")(req);
  if (auth.error) return { status: auth.status, json: { error: auth.error } };
  const database = getDb();
  const memberships = database
    .prepare("SELECT member_id, name, email, plan, status FROM memberships WHERE user_id IS NULL ORDER BY name")
    .all();
  const accounts = database
    .prepare(
      `SELECT u.id, u.email, u.name, u.created_at FROM users u
       LEFT JOIN memberships m ON m.user_id = u.id
       WHERE m.member_id IS NULL ORDER BY u.created_at DESC LIMIT 100`
    )
    .all();
  return {
    status: 200,
    json: {
      unclaimedMemberships: memberships.map((m) => ({
        memberId: m.member_id,
        name: m.name,
        email: m.email,
        plan: m.plan,
        status: m.status
      })),
      accountsWithoutMembership: accounts.map((u) => ({
        userId: u.id,
        email: u.email,
        name: u.name,
        createdAt: u.created_at
      }))
    }
  };
}

export function getAdminBackups(req) {
  const auth = authMiddleware("coach")(req);
  if (auth.error) return { status: auth.status, json: { error: auth.error } };
  return { status: 200, json: { backups: listBackups(), directory: backupDir() } };
}

export function postAdminBackup(req) {
  const auth = authMiddleware("coach")(req);
  if (auth.error) return { status: auth.status, json: { error: auth.error } };
  try {
    const r = runBackup();
    return { status: 200, json: { ok: true, ...r } };
  } catch (e) {
    return { status: 500, json: { error: e.message || "Backup failed" } };
  }
}
