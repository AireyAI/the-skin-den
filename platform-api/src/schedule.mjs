import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config.mjs";
import { getDb } from "./db.mjs";
import {
  buildScheduleInstances,
  scheduleHorizon,
  DEFAULT_SCHEDULE_WEEKS
} from "./schedule-instances.mjs";

const apiRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const schedulePath = () => join(config.dataDir, "schedule.json");

const DOW = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function nextDateForDay(day, from = new Date()) {
  const target = DOW[day];
  if (target == null) throw new Error(`unknown day "${day}"`);
  const d = new Date(from);
  d.setHours(12, 0, 0, 0);
  const same = target === d.getDay();
  if (same) return d.toISOString().slice(0, 10);
  const delta = (target - d.getDay() + 7) % 7 || 7;
  d.setDate(d.getDate() + delta);
  return d.toISOString().slice(0, 10);
}

const OFFICIAL_SCHEDULE_SEED_ID = "kk-official-timetable-2026-07";

function readScheduleTemplate() {
  const template = join(apiRoot, "seed/schedule.template.json");
  return JSON.parse(readFileSync(template, "utf8"));
}

function loadScheduleFile() {
  const p = schedulePath();
  const template = readScheduleTemplate();
  const expectedSeed = template.scheduleSeedId || OFFICIAL_SCHEDULE_SEED_ID;
  if (!existsSync(p)) {
    mkdirSync(config.dataDir, { recursive: true });
    writeFileSync(p, JSON.stringify(template, null, 2) + "\n", "utf8");
    console.log(`[platform-api] wrote schedule.json (${template.offerings?.length || 0} slots)`);
    return template;
  }
  const doc = JSON.parse(readFileSync(p, "utf8"));
  if (doc.scheduleSeedId !== expectedSeed) {
    const upgraded = { ...template, scheduleSeedId: expectedSeed };
    writeFileSync(p, JSON.stringify(upgraded, null, 2) + "\n", "utf8");
    console.log(
      `[platform-api] upgraded schedule.json to ${expectedSeed} (${upgraded.offerings?.length || 0} slots, was ${doc.offerings?.length || 0})`
    );
    return upgraded;
  }
  return doc;
}

function saveScheduleFile(data) {
  mkdirSync(config.dataDir, { recursive: true });
  writeFileSync(schedulePath(), JSON.stringify(data, null, 2) + "\n", "utf8");
}

export function getScheduleDocument() {
  return loadScheduleFile();
}

/**
 * Replace the timetable. Validated because these values price real checkouts — a
 * missing pricePence would otherwise create £0 Stripe sessions.
 */
export function putScheduleDocument(doc) {
  if (!doc || !Array.isArray(doc.offerings)) {
    throw new Error("offerings array required");
  }
  const seen = new Set();
  const offerings = doc.offerings.map((o, i) => {
    const where = `offering ${i + 1}${o?.title ? ` (${o.title})` : ""}`;
    const id = String(o?.id || "").trim();
    if (!id) throw new Error(`${where}: id is required`);
    if (seen.has(id)) throw new Error(`${where}: duplicate id "${id}"`);
    seen.add(id);
    if (DOW[o?.day] == null) throw new Error(`${where}: day must be one of ${Object.keys(DOW).join(", ")}`);
    const pricePence = Number(o?.pricePence);
    if (!Number.isInteger(pricePence) || pricePence < 0 || pricePence > 100000) {
      throw new Error(`${where}: pricePence must be a whole number of pence between 0 and 100000`);
    }
    const capacity = o?.capacity == null ? 30 : Number(o.capacity);
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 200) {
      throw new Error(`${where}: capacity must be between 1 and 200`);
    }
    return {
      id,
      day: o.day,
      time: String(o?.time || "").slice(0, 40),
      title: String(o?.title || "Class").slice(0, 120),
      note: String(o?.note || "").slice(0, 240),
      pricePence,
      capacity,
      active: o?.active !== false
    };
  });
  saveScheduleFile({
    venue: String(doc.venue || "").slice(0, 240),
    cancelPolicy: String(doc.cancelPolicy || "").slice(0, 600),
    offerings
  });
  return getScheduleDocument();
}

export function getPublicSchedule() {
  const doc = loadScheduleFile();
  const database = getDb();
  // Mirror countBooked(): abandoned checkouts stop holding a seat after the hold window.
  const holdSince = new Date(Date.now() - config.bookingHoldMinutes * 60_000).toISOString();
  const bookedRows = database
    .prepare(
      `SELECT offering_id, slot_date, COUNT(*) AS c FROM class_bookings
       WHERE status IN ('paid','booked') OR (status = 'pending' AND created_at >= ?)
       GROUP BY offering_id, slot_date`
    )
    .all(holdSince);

  const taken = new Map(bookedRows.map((r) => [`${r.offering_id}:${r.slot_date}`, r.c]));

  const upcoming = doc.offerings
    .filter((o) => o.active !== false)
    .map((o) => {
      const date = nextDateForDay(o.day);
      const key = `${o.id}:${date}`;
      const booked = taken.get(key) || 0;
      const capacity = o.capacity ?? 30;
      return {
        id: o.id,
        day: o.day,
        time: o.time,
        title: o.title,
        note: o.note || "",
        date,
        pricePence: o.pricePence,
        priceLabel: `£${(o.pricePence / 100).toFixed(2)}`,
        capacity,
        booked,
        remaining: Math.max(0, capacity - booked),
        full: booked >= capacity
      };
    });

  return {
    venue: doc.venue,
    cancelPolicy: doc.cancelPolicy,
    upcoming
  };
}

function bookedCountsMap(database) {
  const holdSince = new Date(Date.now() - config.bookingHoldMinutes * 60_000).toISOString();
  const bookedRows = database
    .prepare(
      `SELECT offering_id, slot_date, COUNT(*) AS c FROM class_bookings
       WHERE status IN ('paid','booked') OR (status = 'pending' AND created_at >= ?)
       GROUP BY offering_id, slot_date`
    )
    .all(holdSince);
  return new Map(bookedRows.map((r) => [`${r.offering_id}:${r.slot_date}`, r.c]));
}

export function getPublicScheduleInstances(weeks = DEFAULT_SCHEDULE_WEEKS) {
  const doc = loadScheduleFile();
  const database = getDb();
  const w = Math.min(Math.max(Number(weeks) || DEFAULT_SCHEDULE_WEEKS, 1), 26);
  const horizon = scheduleHorizon(w);
  const instances = buildScheduleInstances(
    doc.offerings.filter((o) => o.active !== false),
    bookedCountsMap(database),
    horizon
  );
  return {
    venue: doc.venue,
    cancelPolicy: doc.cancelPolicy,
    reschedulePolicy:
      "Paid bookings can be moved to another available class date from your account. We do not offer refunds — pick a new date instead.",
    weeks: w,
    from: horizon.from,
    to: horizon.to,
    instances
  };
}

export function getOffering(offeringId) {
  const doc = loadScheduleFile();
  return doc.offerings.find((o) => o.id === offeringId && o.active !== false) || null;
}

export { nextDateForDay };

export function resetScheduleFromSeed() {
  const seed = readScheduleTemplate();
  saveScheduleFile(seed);
  return seed;
}
