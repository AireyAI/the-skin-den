import test from "node:test";
import assert from "node:assert/strict";
import {
  datesForWeeklyOffering,
  buildScheduleInstances,
  scheduleHorizon
} from "../src/schedule-instances.mjs";

test("datesForWeeklyOffering lists weekly Mon dates in range", () => {
  const dates = datesForWeeklyOffering("Mon", "2026-07-27", "2026-08-16");
  assert.ok(dates.length >= 3);
  assert.equal(dates[0], "2026-07-27");
  for (const d of dates) {
    assert.equal(new Date(`${d}T12:00:00`).getDay(), 1);
  }
});

test("buildScheduleInstances marks full slots", () => {
  const taken = new Map([["cls-1:2026-07-27", 30]]);
  const instances = buildScheduleInstances(
    [
      {
        id: "cls-1",
        day: "Mon",
        time: "18:30",
        title: "Strength",
        pricePence: 1000,
        capacity: 30,
        active: true
      }
    ],
    taken,
    { from: "2026-07-27", to: "2026-08-03" }
  );
  const first = instances.find((i) => i.date === "2026-07-27");
  assert.equal(first.remaining, 0);
  assert.equal(first.full, true);
});

test("scheduleHorizon spans requested weeks", () => {
  const { from, to } = scheduleHorizon(4);
  assert.match(from, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(to > from);
});
