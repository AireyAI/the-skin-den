const DOW = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const DEFAULT_SCHEDULE_WEEKS = 12;

export function scheduleHorizon(weeks = DEFAULT_SCHEDULE_WEEKS) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const from = today.toISOString().slice(0, 10);
  const end = new Date(today);
  end.setDate(end.getDate() + weeks * 7);
  return { from, to: end.toISOString().slice(0, 10) };
}

/** All calendar dates for a weekly offering between from and to (inclusive). */
export function datesForWeeklyOffering(day, fromIso, toIso) {
  const target = DOW[day];
  if (target == null) return [];
  const from = new Date(`${fromIso}T12:00:00`);
  const to = new Date(`${toIso}T12:00:00`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) return [];

  const d = new Date(from);
  d.setHours(12, 0, 0, 0);
  while (d.getDay() !== target && d <= to) {
    d.setDate(d.getDate() + 1);
  }
  const out = [];
  while (d <= to) {
    out.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 7);
  }
  return out;
}

export function buildScheduleInstances(offerings, takenMap, { from, to } = scheduleHorizon()) {
  const instances = [];
  for (const o of offerings) {
    if (o.active === false) continue;
    const capacity = o.capacity ?? 30;
    for (const date of datesForWeeklyOffering(o.day, from, to)) {
      const key = `${o.id}:${date}`;
      const booked = takenMap.get(key) || 0;
      const remaining = Math.max(0, capacity - booked);
      instances.push({
        id: o.id,
        offeringId: o.id,
        day: o.day,
        time: o.time,
        title: o.title,
        note: o.note || "",
        date,
        pricePence: o.pricePence,
        priceLabel: `£${(o.pricePence / 100).toFixed(2)}`,
        capacity,
        booked,
        remaining,
        full: remaining <= 0
      });
    }
  }
  instances.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return String(a.time).localeCompare(String(b.time));
  });
  return instances;
}

export { DAY_NAMES, DOW };
