import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import {
  countBooked,
  assertCapacityWithinTransaction,
  runBookingTransaction,
  resolveSlotDate
} from "../src/booking-capacity.mjs";

function memDb() {
  const db = new DatabaseSync(":memory:");
  db.prepare(
    `CREATE TABLE class_bookings (
      id TEXT PRIMARY KEY,
      offering_id TEXT NOT NULL,
      slot_date TEXT NOT NULL,
      customer_name TEXT NOT NULL,
      customer_email TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`
  ).run();
  return db;
}

test("resolveSlotDate rejects wrong weekday", () => {
  const offering = { day: "Mon" };
  assert.equal(resolveSlotDate("2026-07-28", offering), null);
});

test("assertCapacityWithinTransaction fails when slot is full", () => {
  const db = memDb();
  const now = new Date().toISOString();
  for (let i = 0; i < 2; i++) {
    db.prepare(
      `INSERT INTO class_bookings (id, offering_id, slot_date, customer_name, customer_email, status, created_at)
       VALUES (?,?,?,?,?,?,?)`
    ).run(`bk_${i}`, "o1", "2026-07-27", "A", "a@test.com", "paid", now);
  }
  runBookingTransaction(db, () => {
    assert.throws(
      () =>
        assertCapacityWithinTransaction(
          db,
          [{ offeringId: "o1", slotDate: "2026-07-27", capacity: 2 }],
          {}
        ),
      (e) => e.status === 409
    );
  });
});

test("excludeBookingId frees seat for reschedule", () => {
  const db = memDb();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO class_bookings (id, offering_id, slot_date, customer_name, customer_email, status, created_at)
     VALUES (?,?,?,?,?,?,?)`
  ).run("bk_move", "o1", "2026-07-27", "A", "a@test.com", "paid", now);
  runBookingTransaction(db, () => {
    assertCapacityWithinTransaction(
      db,
      [{ offeringId: "o1", slotDate: "2026-07-27", capacity: 1 }],
      { excludeBookingId: "bk_move" }
    );
  });
  assert.equal(countBooked(db, "o1", "2026-07-27"), 1);
});
