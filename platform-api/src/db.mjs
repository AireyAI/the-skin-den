import { mkdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { config } from "./config.mjs";

let db;

export function getDb() {
  if (db) return db;
  mkdirSync(config.dataDir, { recursive: true });
  db = new DatabaseSync(config.dbPath);
  db.prepare("PRAGMA journal_mode = WAL").run();
  db.prepare("PRAGMA foreign_keys = ON").run();
  // Without this, a concurrent writer fails instantly with SQLITE_BUSY instead of
  // waiting its turn.
  db.prepare("PRAGMA busy_timeout = 5000").run();
  migrate(db);
  return db;
}

/**
 * One SQLite file on one volume cannot be shared by two containers — they will lock
 * each other out and can corrupt the WAL. If this service is ever scaled up, the
 * database has to move before the replica count does.
 */
export function warnIfMultiReplica() {
  const replicas = Number(process.env.RAILWAY_REPLICA_COUNT || process.env.WEB_CONCURRENCY || 1);
  if (Number.isFinite(replicas) && replicas > 1) {
    console.error(
      `[platform-api] WARNING: ${replicas} replicas are configured, but this service stores ` +
        "everything in a single SQLite file on one volume. Run exactly one replica, or migrate to Postgres."
    );
  }
}

function runSql(database, sql) {
  database.prepare(sql).run();
}

function migrate(database) {
  runSql(
    database,
    `CREATE TABLE IF NOT EXISTS coaches (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`
  );
  runSql(
    database,
    `CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE,
      password_hash TEXT,
      apple_sub TEXT UNIQUE,
      name TEXT,
      phone TEXT,
      forge_user_id TEXT,
      created_at TEXT NOT NULL
    )`
  );
  runSql(
    database,
    `CREATE TABLE IF NOT EXISTS memberships (
      member_id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id),
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT,
      plan TEXT NOT NULL,
      plan_type TEXT NOT NULL,
      status TEXT NOT NULL,
      renewal_date TEXT,
      auto_renew INTEGER NOT NULL DEFAULT 0,
      last_payment_status TEXT,
      last_payment_at TEXT,
      mrr_contribution REAL NOT NULL DEFAULT 0,
      pack_credits INTEGER,
      pack_expires_at TEXT,
      joined_at TEXT,
      last_class_at TEXT,
      notes TEXT,
      contacted_at TEXT,
      stripe_customer_id TEXT,
      updated_at TEXT NOT NULL
    )`
  );
  runSql(database, "CREATE INDEX IF NOT EXISTS idx_memberships_user ON memberships(user_id)");
  runSql(database, "CREATE INDEX IF NOT EXISTS idx_memberships_email ON memberships(email)");
  runSql(
    database,
    `CREATE TABLE IF NOT EXISTS class_bookings (
      id TEXT PRIMARY KEY,
      offering_id TEXT NOT NULL,
      slot_date TEXT NOT NULL,
      customer_name TEXT NOT NULL,
      customer_email TEXT NOT NULL,
      customer_phone TEXT,
      stripe_session_id TEXT,
      stripe_payment_intent TEXT,
      status TEXT NOT NULL,
      price_pence INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT
    )`
  );
  runSql(database, "CREATE INDEX IF NOT EXISTS idx_class_bookings_slot ON class_bookings(offering_id, slot_date)");
  runSql(database, "CREATE INDEX IF NOT EXISTS idx_class_bookings_status ON class_bookings(status, created_at)");
  const userCols = database.prepare("PRAGMA table_info(users)").all();
  if (!userCols.some((c) => c.name === "google_sub")) {
    runSql(database, "ALTER TABLE users ADD COLUMN google_sub TEXT");
    runSql(database, "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_sub ON users(google_sub) WHERE google_sub IS NOT NULL");
  }
  const bookingCols = database.prepare("PRAGMA table_info(class_bookings)").all();
  if (!bookingCols.some((c) => c.name === "member_id")) {
    runSql(database, "ALTER TABLE class_bookings ADD COLUMN member_id TEXT");
  }
  runSql(
    database,
    `CREATE TABLE IF NOT EXISTS payment_events (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      reference_id TEXT,
      member_id TEXT,
      amount_pence INTEGER NOT NULL,
      platform_fee_pence INTEGER NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'gbp',
      status TEXT NOT NULL,
      stripe_payment_intent TEXT,
      customer_email TEXT,
      created_at TEXT NOT NULL
    )`
  );
  runSql(database, "CREATE INDEX IF NOT EXISTS idx_payment_events_created ON payment_events(created_at)");
  runSql(
    database,
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_events_pi ON payment_events(stripe_payment_intent) WHERE stripe_payment_intent IS NOT NULL"
  );
  runSql(
    database,
    `CREATE TABLE IF NOT EXISTS check_ins (
      id TEXT PRIMARY KEY,
      member_id TEXT NOT NULL,
      user_id TEXT,
      coach_id TEXT,
      scanned_at TEXT NOT NULL,
      credits_before INTEGER,
      credits_after INTEGER,
      deducted INTEGER NOT NULL DEFAULT 0,
      result TEXT NOT NULL,
      scan_raw TEXT
    )`
  );
  runSql(database, "CREATE INDEX IF NOT EXISTS idx_check_ins_member ON check_ins(member_id, scanned_at)");
  runSql(
    database,
    `CREATE TABLE IF NOT EXISTS processed_events (
      event_id TEXT PRIMARY KEY,
      type TEXT,
      processed_at TEXT NOT NULL
    )`
  );
  runSql(
    database,
    `CREATE TABLE IF NOT EXISTS tenant_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`
  );
  runSql(
    database,
    `CREATE TABLE IF NOT EXISTS booking_reschedule_log (
      id TEXT PRIMARY KEY,
      booking_id TEXT NOT NULL,
      from_offering_id TEXT NOT NULL,
      from_slot_date TEXT NOT NULL,
      to_offering_id TEXT NOT NULL,
      to_slot_date TEXT NOT NULL,
      actor_user_id TEXT,
      actor_coach_id TEXT,
      created_at TEXT NOT NULL
    )`
  );
  runSql(
    database,
    "CREATE INDEX IF NOT EXISTS idx_reschedule_log_booking ON booking_reschedule_log(booking_id, created_at)"
  );
  // Two memberships sharing an email makes "which member is this?" ambiguous for every
  // email lookup in the codebase. Enforce it going forward; if legacy duplicates already
  // exist, say so loudly rather than failing the boot.
  try {
    runSql(
      database,
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_memberships_email_unique ON memberships(lower(email))"
    );
  } catch {
    const dupes = database
      .prepare(
        "SELECT lower(email) AS e, COUNT(*) AS c FROM memberships GROUP BY lower(email) HAVING c > 1"
      )
      .all();
    console.warn(
      "[platform-api] WARNING: duplicate membership emails block the unique index — merge these in admin:",
      dupes.map((d) => `${d.e} x${d.c}`).join(", ")
    );
  }
}

/**
 * Stripe delivers at least once: any timeout, 5xx, or a dashboard "Resend" replays the
 * event. Returns false when this event id has already been applied.
 */
export function claimStripeEvent(database, eventId, type) {
  if (!eventId) return true; // unidentifiable event — let the handler's own guards decide
  const res = database
    .prepare("INSERT OR IGNORE INTO processed_events (event_id, type, processed_at) VALUES (?, ?, ?)")
    .run(eventId, type || null, new Date().toISOString());
  return res.changes > 0;
}


export function rowToMember(row) {
  if (!row) return null;
  return {
    id: row.member_id,
    userId: row.user_id,
    name: row.name,
    email: row.email,
    phone: row.phone || "",
    plan: row.plan,
    planType: row.plan_type,
    status: row.status,
    renewalDate: row.renewal_date,
    autoRenew: !!row.auto_renew,
    lastPaymentStatus: normalizePaymentStatus(row.last_payment_status),
    lastPaymentAt: row.last_payment_at,
    mrrContribution: row.mrr_contribution,
    packCredits: row.pack_credits,
    packExpiresAt: row.pack_expires_at,
    joinedAt: row.joined_at,
    lastClassAt: row.last_class_at,
    notes: row.notes || "",
    contactedAt: row.contacted_at,
    stripeCustomerId: row.stripe_customer_id || null
  };
}

function normalizePaymentStatus(raw) {
  if (!raw) return "ok";
  if (raw === "succeeded") return "ok";
  if (raw === "failed" || raw === "pending") return raw;
  return raw;
}

export function memberToRow(m) {
  return {
    member_id: m.id,
    user_id: m.userId ?? null,
    name: m.name,
    email: m.email,
    phone: m.phone ?? null,
    plan: m.plan,
    plan_type: m.planType,
    status: m.status,
    renewal_date: m.renewalDate ?? null,
    auto_renew: m.autoRenew ? 1 : 0,
    last_payment_status: m.lastPaymentStatus === "ok" ? "succeeded" : m.lastPaymentStatus,
    last_payment_at: m.lastPaymentAt ?? null,
    mrr_contribution: m.mrrContribution ?? 0,
    pack_credits: m.packCredits ?? null,
    pack_expires_at: m.packExpiresAt ?? null,
    joined_at: m.joinedAt ?? null,
    last_class_at: m.lastClassAt ?? null,
    notes: m.notes ?? "",
    contacted_at: m.contactedAt ?? null,
    stripe_customer_id: m.stripeCustomerId ?? null,
    updated_at: new Date().toISOString()
  };
}

export function listMembers(database) {
  const rows = database.prepare("SELECT * FROM memberships ORDER BY name").all();
  return rows.map(rowToMember);
}

export function getMember(database, memberId) {
  const row = database.prepare("SELECT * FROM memberships WHERE member_id = ?").get(memberId);
  return rowToMember(row);
}

export function upsertMember(database, member) {
  const r = memberToRow(member);
  database
    .prepare(
      `INSERT INTO memberships (
        member_id, user_id, name, email, phone, plan, plan_type, status,
        renewal_date, auto_renew, last_payment_status, last_payment_at,
        mrr_contribution, pack_credits, pack_expires_at, joined_at, last_class_at,
        notes, contacted_at, stripe_customer_id, updated_at
      ) VALUES (
        @member_id, @user_id, @name, @email, @phone, @plan, @plan_type, @status,
        @renewal_date, @auto_renew, @last_payment_status, @last_payment_at,
        @mrr_contribution, @pack_credits, @pack_expires_at, @joined_at, @last_class_at,
        @notes, @contacted_at, @stripe_customer_id, @updated_at
      )
      ON CONFLICT(member_id) DO UPDATE SET
        user_id=excluded.user_id, name=excluded.name, email=excluded.email, phone=excluded.phone,
        plan=excluded.plan, plan_type=excluded.plan_type, status=excluded.status,
        renewal_date=excluded.renewal_date, auto_renew=excluded.auto_renew,
        last_payment_status=excluded.last_payment_status, last_payment_at=excluded.last_payment_at,
        mrr_contribution=excluded.mrr_contribution, pack_credits=excluded.pack_credits,
        pack_expires_at=excluded.pack_expires_at, joined_at=excluded.joined_at,
        last_class_at=excluded.last_class_at, notes=excluded.notes,
        contacted_at=excluded.contacted_at, stripe_customer_id=excluded.stripe_customer_id,
        updated_at=excluded.updated_at`
    )
    .run(r);
}

export function markContacted(database, memberId) {
  const ts = new Date().toISOString();
  database.prepare("UPDATE memberships SET contacted_at = ?, updated_at = ? WHERE member_id = ?").run(ts, ts, memberId);
  return getMember(database, memberId);
}

/**
 * A membership belongs to a user only once it has been explicitly linked.
 *
 * There used to be a fallback here that matched on the user's email when no row
 * carried their user_id. That made every membership claimable by anyone who could
 * type the buyer's email address into the signup form, so it is gone: ownership is
 * the user_id column and nothing else.
 */
export function membershipForUser(database, userId) {
  if (!userId) return null;
  const row = database.prepare("SELECT * FROM memberships WHERE user_id = ?").get(userId);
  return rowToMember(row);
}

/** An unlinked membership matching this email, if one is waiting to be claimed. */
export function unclaimedMembershipForEmail(database, email) {
  if (!email) return null;
  const row = database
    .prepare("SELECT * FROM memberships WHERE lower(email) = lower(?) AND user_id IS NULL")
    .get(email);
  return rowToMember(row);
}

/**
 * Bind an unclaimed membership to a user.
 *
 * `proof` records how we know this person owns the address — a verified claim from
 * Google/Apple, a completed Stripe Checkout session, or a coach doing it by hand.
 * Callers without proof must not link: an unverified email is just a string the
 * visitor typed. Never re-points a membership that is already claimed.
 */
const LINK_PROOFS = new Set([
  "stripe_checkout_session",
  "google_verified_email",
  "apple_verified_email",
  "coach_manual"
]);

export function linkMembershipToUser(database, userId, email, proof) {
  if (!userId || !email || !proof) return { linked: false, reason: "no_proof" };
  if (!LINK_PROOFS.has(proof)) return { linked: false, reason: "invalid_proof" };
  const res = database
    .prepare(
      "UPDATE memberships SET user_id = ?, updated_at = ? WHERE lower(email) = lower(?) AND user_id IS NULL"
    )
    .run(userId, new Date().toISOString(), email);
  return { linked: res.changes > 0, proof };
}
