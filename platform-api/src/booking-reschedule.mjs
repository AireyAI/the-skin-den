import { randomUUID } from "node:crypto";
import { getOffering } from "./schedule.mjs";
import {
  assertCapacityWithinTransaction,
  isSlotDateUpcoming,
  resolveSlotDate,
  runBookingTransaction
} from "./booking-capacity.mjs";
import { getBookingById, rowToBooking } from "./bookings-db.mjs";

const ACTIVE = new Set(["paid", "booked"]);

export function bookingOwnedByUser(booking, { userId, userEmail, memberId }) {
  if (!booking) return false;
  if (memberId && booking.memberId === memberId) return true;
  if (userEmail && booking.customerEmail?.toLowerCase() === userEmail.toLowerCase()) return true;
  return false;
}

export function performReschedule(
  database,
  bookingId,
  { offeringId, date },
  { actorUserId = null, actorCoachId = null } = {}
) {
  const existing = getBookingById(database, bookingId);
  if (!existing) return { status: 404, json: { error: "Booking not found." } };
  if (!ACTIVE.has(existing.status)) {
    return { status: 400, json: { error: "Only confirmed bookings can be rescheduled." } };
  }
  if (!isSlotDateUpcoming(existing.slotDate)) {
    return { status: 400, json: { error: "Past classes cannot be rescheduled." } };
  }

  const targetOfferingId = offeringId || existing.offeringId;
  const offering = getOffering(targetOfferingId);
  if (!offering) return { status: 404, json: { error: "Class not found." } };

  const slotDate = resolveSlotDate(date, offering);
  if (!slotDate) {
    return {
      status: 400,
      json: { error: `Pick a valid ${offering.day} date within the next 90 days.` }
    };
  }
  if (!isSlotDateUpcoming(slotDate)) {
    return { status: 400, json: { error: "Pick a future class date." } };
  }

  if (existing.offeringId === targetOfferingId && existing.slotDate === slotDate) {
    return { status: 200, json: { booking: existing, unchanged: true } };
  }

  try {
    runBookingTransaction(database, () => {
      assertCapacityWithinTransaction(
        database,
        [
          {
            offeringId: targetOfferingId,
            slotDate,
            capacity: offering.capacity ?? 30
          }
        ],
        { excludeBookingId: bookingId }
      );
      const now = new Date().toISOString();
      database
        .prepare(
          `UPDATE class_bookings
           SET offering_id = ?, slot_date = ?, updated_at = ?
           WHERE id = ?`
        )
        .run(targetOfferingId, slotDate, now, bookingId);
      database
        .prepare(
          `INSERT INTO booking_reschedule_log (
            id, booking_id, from_offering_id, from_slot_date, to_offering_id, to_slot_date,
            actor_user_id, actor_coach_id, created_at
          ) VALUES (?,?,?,?,?,?,?,?,?)`
        )
        .run(
          `rsl_${randomUUID().slice(0, 12)}`,
          bookingId,
          existing.offeringId,
          existing.slotDate,
          targetOfferingId,
          slotDate,
          actorUserId,
          actorCoachId,
          now
        );
    });
  } catch (e) {
    if (e?.status === 409) return { status: 409, json: { error: e.message } };
    throw e;
  }

  const row = database.prepare("SELECT * FROM class_bookings WHERE id = ?").get(bookingId);
  return { status: 200, json: { booking: rowToBooking(row) } };
}
