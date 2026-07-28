import { config } from "./config.mjs";

export function rowToBooking(row) {
  if (!row) return null;
  const feeBps = config.platformFeeBps;
  const platformFeePence = Math.floor((row.price_pence * feeBps) / 10000);
  return {
    id: row.id,
    offeringId: row.offering_id,
    slotDate: row.slot_date,
    customerName: row.customer_name,
    customerEmail: row.customer_email,
    customerPhone: row.customer_phone || "",
    status: row.status,
    pricePence: row.price_pence,
    priceLabel: `£${(row.price_pence / 100).toFixed(2)}`,
    platformFeePence,
    platformFeeLabel: `£${(platformFeePence / 100).toFixed(2)}`,
    stripeSessionId: row.stripe_session_id,
    stripePaymentIntent: row.stripe_payment_intent,
    memberId: row.member_id || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function listBookings(database, opts = {}) {
  const limit = Math.min(Number(opts.limit) || 200, 500);
  const status = opts.status;
  let sql = "SELECT * FROM class_bookings";
  const params = [];
  if (status && status !== "all") {
    sql += " WHERE status = ?";
    params.push(status);
  }
  sql += " ORDER BY datetime(created_at) DESC LIMIT ?";
  params.push(limit);
  return database.prepare(sql).all(...params).map(rowToBooking);
}

/** Bookings tied to a member account (email match and/or linked membership id). */
export function listBookingsForMember(database, { email, memberId, limit = 24 } = {}) {
  const clauses = [];
  const params = [];
  if (email) {
    clauses.push("lower(customer_email) = lower(?)");
    params.push(email.trim());
  }
  if (memberId) {
    clauses.push("member_id = ?");
    params.push(memberId);
  }
  if (!clauses.length) return [];

  const cap = Math.min(Number(limit) || 24, 50);
  const sql = `
    SELECT * FROM class_bookings
    WHERE status IN ('pending','paid','booked')
      AND (${clauses.join(" OR ")})
    ORDER BY slot_date ASC, datetime(created_at) DESC
    LIMIT ?
  `;
  params.push(cap);
  return database.prepare(sql).all(...params).map(rowToBooking);
}

/**
 * Studio revenue for the period.
 *
 * Sums the payment_events ledger, not class_bookings. Class bookings write to both,
 * but pack and membership sales only reach the ledger — summing bookings alone meant
 * the dashboard reported £0 for the £65 packs and £55 memberships, which is most of
 * the money and the whole basis of the platform fee.
 */
export function bookingRevenueSummary(database, days = 30) {
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const ledger = database
    .prepare(
      `SELECT COUNT(*) AS count,
              COALESCE(SUM(amount_pence), 0) AS total_pence,
              COALESCE(SUM(platform_fee_pence), 0) AS fee_pence
       FROM payment_events WHERE status = 'paid' AND created_at >= ?`
    )
    .get(since);
  const bySource = database
    .prepare(
      `SELECT source, COUNT(*) AS count, COALESCE(SUM(amount_pence), 0) AS total_pence
       FROM payment_events WHERE status = 'paid' AND created_at >= ? GROUP BY source`
    )
    .all(since);
  const paidBookings = database
    .prepare(
      `SELECT COUNT(*) AS c FROM class_bookings
       WHERE status = 'paid' AND COALESCE(updated_at, created_at) >= ?`
    )
    .get(since).c;
  const pending = database
    .prepare(`SELECT COUNT(*) AS c FROM class_bookings WHERE status = 'pending'`)
    .get().c;

  const totalPence = ledger.total_pence || 0;
  const platformFeePence = ledger.fee_pence || 0;
  return {
    periodDays: days,
    paidCount: ledger.count || 0,
    paidBookingCount: paidBookings,
    grossPence: totalPence,
    grossLabel: `£${(totalPence / 100).toFixed(2)}`,
    platformFeePence,
    platformFeeLabel: `£${(platformFeePence / 100).toFixed(2)}`,
    platformFeeBps: config.platformFeeBps,
    pendingCheckoutCount: pending,
    bySource: bySource.map((r) => ({
      source: r.source,
      count: r.count,
      grossPence: r.total_pence,
      grossLabel: `£${(r.total_pence / 100).toFixed(2)}`
    }))
  };
}

export function recordPaymentEvent(database, event) {
  if (event.stripePaymentIntent) {
    const dup = database
      .prepare("SELECT id FROM payment_events WHERE stripe_payment_intent = ? LIMIT 1")
      .get(event.stripePaymentIntent);
    if (dup) return { inserted: false, id: dup.id };
  }
  database
    .prepare(
      `INSERT INTO payment_events (
        id, source, reference_id, member_id, amount_pence, platform_fee_pence,
        currency, status, stripe_payment_intent, customer_email, created_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?)`
    )
    .run(
      event.id,
      event.source,
      event.referenceId,
      event.memberId ?? null,
      event.amountPence,
      event.platformFeePence,
      event.currency || "gbp",
      event.status,
      event.stripePaymentIntent ?? null,
      event.customerEmail ?? null,
      event.createdAt || new Date().toISOString()
    );
  return { inserted: true, id: event.id };
}

export function listPaymentEvents(database, limit = 100) {
  const rows = database
    .prepare(
      `SELECT * FROM payment_events ORDER BY datetime(created_at) DESC LIMIT ?`
    )
    .all(Math.min(limit, 500));
  return rows.map((row) => ({
    id: row.id,
    source: row.source,
    referenceId: row.reference_id,
    memberId: row.member_id,
    amountPence: row.amount_pence,
    amountLabel: `£${(row.amount_pence / 100).toFixed(2)}`,
    platformFeePence: row.platform_fee_pence,
    platformFeeLabel: `£${(row.platform_fee_pence / 100).toFixed(2)}`,
    status: row.status,
    customerEmail: row.customer_email,
    createdAt: row.created_at
  }));
}

export function getBookingById(database, bookingId) {
  const row = database.prepare("SELECT * FROM class_bookings WHERE id = ?").get(bookingId);
  return rowToBooking(row);
}

export function linkBookingsToAccount(database, { email, memberId }) {
  if (!email) return 0;
  const now = new Date().toISOString();
  const res = database
    .prepare(
      `UPDATE class_bookings
       SET member_id = COALESCE(?, member_id), updated_at = ?
       WHERE lower(customer_email) = lower(?)
         AND status IN ('pending','paid','booked')`
    )
    .run(memberId || null, now, email.trim());
  return res.changes || 0;
}

export function listRescheduleLog(database, bookingId, limit = 20) {
  return database
    .prepare(
      `SELECT * FROM booking_reschedule_log WHERE booking_id = ? ORDER BY datetime(created_at) DESC LIMIT ?`
    )
    .all(bookingId, Math.min(limit, 50));
}

export function listBookingsForRoster(database, { from, to, q } = {}) {
  let sql = `SELECT * FROM class_bookings WHERE status IN ('paid','booked','pending')`;
  const params = [];
  if (from) {
    sql += " AND slot_date >= ?";
    params.push(from);
  }
  if (to) {
    sql += " AND slot_date <= ?";
    params.push(to);
  }
  if (q) {
    sql += " AND (lower(customer_name) LIKE ? OR lower(customer_email) LIKE ?)";
    const like = `%${String(q).trim().toLowerCase()}%`;
    params.push(like, like);
  }
  sql += " ORDER BY slot_date ASC, datetime(created_at) ASC LIMIT 500";
  return database.prepare(sql).all(...params).map(rowToBooking);
}

