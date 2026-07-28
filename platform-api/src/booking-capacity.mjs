import { config } from "./config.mjs";
import { nextDateForDay } from "./schedule.mjs";
import { DAY_NAMES } from "./schedule-instances.mjs";

export function holdSinceIso() {
  return new Date(Date.now() - config.bookingHoldMinutes * 60_000).toISOString();
}

export function countBooked(database, offeringId, slotDate, { excludeBookingId } = {}) {
  const holdSince = holdSinceIso();
  let sql = `SELECT COUNT(*) AS c FROM class_bookings
       WHERE offering_id = ? AND slot_date = ?
         AND (status IN ('paid','booked') OR (status = 'pending' AND created_at >= ?))`;
  const params = [offeringId, slotDate, holdSince];
  if (excludeBookingId) {
    sql += " AND id != ?";
    params.push(excludeBookingId);
  }
  const row = database.prepare(sql).get(...params);
  return row?.c || 0;
}

/** Valid date: offering weekday, today or later, within 90 days. */
export function resolveSlotDate(requested, offering) {
  if (!requested) return nextDateForDay(offering.day);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(requested)) return null;
  const d = new Date(`${requested}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  if (DAY_NAMES[d.getDay()] !== offering.day) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const maxAhead = new Date(today.getTime() + 90 * 86400000);
  if (d < today || d > maxAhead) return null;
  return requested;
}

export function isSlotDateUpcoming(slotDate) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(`${slotDate}T12:00:00`);
  return !Number.isNaN(d.getTime()) && d >= today;
}

/**
 * @param {Array<{ offeringId: string, slotDate: string, capacity: number }>} slots
 * @throws {{ status: number, message: string }}
 */
export function assertCapacityWithinTransaction(database, slots, { excludeBookingId } = {}) {
  const demand = new Map();
  for (const s of slots) {
    const key = `${s.offeringId}:${s.slotDate}`;
    demand.set(key, (demand.get(key) || 0) + 1);
  }
  for (const [key, need] of demand) {
    const [offeringId, slotDate] = key.split(":");
    const spec = slots.find((s) => s.offeringId === offeringId && s.slotDate === slotDate);
    const capacity = spec?.capacity ?? 30;
    const taken = countBooked(database, offeringId, slotDate, { excludeBookingId });
    if (taken + need > capacity) {
      throw { status: 409, message: "That class is full — pick another date or time." };
    }
  }
}

export function runBookingTransaction(database, fn) {
  database.prepare("BEGIN IMMEDIATE").run();
  try {
    const result = fn();
    database.prepare("COMMIT").run();
    return result;
  } catch (e) {
    database.prepare("ROLLBACK").run();
    throw e;
  }
}
