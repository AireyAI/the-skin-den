import {
  loadScheduleInstances,
  renderBookingCalendar,
  datesWithClasses,
  slotKey,
  formatDayHeading
} from "./booking-instances.js";
import { memberPlatformFetch } from "../member-session.js";

let cachedInstances = null;

async function ensureInstances() {
  if (cachedInstances) return cachedInstances;
  const base = window.KK_PLATFORM_API || window.SITE_CONFIG?.platformApiUrl || "";
  cachedInstances = await loadScheduleInstances(window.fetch.bind(window), base, 12);
  return cachedInstances;
}

function openDialog(booking, onDone) {
  const backdrop = document.createElement("div");
  backdrop.className = "member-reschedule-backdrop";
  backdrop.setAttribute("role", "dialog");
  backdrop.setAttribute("aria-modal", "true");
  backdrop.setAttribute("aria-labelledby", "reschedule-title");

  const panel = document.createElement("div");
  panel.className = "member-reschedule-panel";

  const title = document.createElement("h2");
  title.id = "reschedule-title";
  title.textContent = "Change class date";

  const lede = document.createElement("p");
  lede.className = "acct-muted";
  lede.textContent =
    "Pick another available date. Your payment stays the same — we do not offer refunds.";

  const calendarHost = document.createElement("div");
  calendarHost.className = "booking-calendar";
  const slotsHost = document.createElement("div");
  slotsHost.className = "member-reschedule-slots";

  const message = document.createElement("p");
  message.className = "member-reschedule-message";
  message.setAttribute("role", "status");

  const actions = document.createElement("div");
  actions.className = "member-reschedule-actions";
  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "button button--ghost";
  cancelBtn.textContent = "Cancel";
  actions.append(cancelBtn);

  panel.append(title, lede, calendarHost, slotsHost, message, actions);
  backdrop.append(panel);
  document.body.append(backdrop);

  let selectedDate = "";
  let selectedOffering = booking.offeringId;

  function close() {
    backdrop.remove();
  }

  cancelBtn.addEventListener("click", close);
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) close();
  });

  async function paintSlots() {
    slotsHost.replaceChildren();
    if (!selectedDate) return;
    const instances = await ensureInstances();
    const options = instances.filter(
      (i) =>
        i.date === selectedDate &&
        !i.full &&
        (i.offeringId === booking.offeringId || i.id === booking.offeringId)
    );
    if (!options.length) {
      const p = document.createElement("p");
      p.className = "acct-muted";
      p.textContent = "No open spots for this class on that date — try another date.";
      slotsHost.append(p);
      return;
    }
    const head = document.createElement("p");
    head.className = "member-reschedule-slots-label";
    head.textContent = "Available times";
    slotsHost.append(head);
    for (const inst of options) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "slot-button slot-button--recurring";
      btn.textContent = `${inst.time} · ${inst.remaining}/${inst.capacity} spots left`;
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        message.textContent = "Updating your booking…";
        try {
          await memberPlatformFetch(`/v1/member/bookings/${encodeURIComponent(booking.id)}`, {
            method: "PATCH",
            body: JSON.stringify({ offeringId: inst.offeringId, date: inst.date })
          });
          message.dataset.tone = "success";
          message.textContent = "Booking updated.";
          cachedInstances = null;
          onDone?.();
          setTimeout(close, 700);
        } catch (err) {
          message.textContent = err.message || "Could not reschedule.";
          btn.disabled = false;
        }
      });
      slotsHost.append(btn);
    }
  }

  ensureInstances()
    .then((instances) => {
      const dateRows = datesWithClasses(
        instances.filter((i) => i.offeringId === booking.offeringId || i.id === booking.offeringId)
      );
      renderBookingCalendar(calendarHost, dateRows, {
        selectedDate: booking.slotDate,
        onSelect: (date) => {
          selectedDate = date;
          message.textContent = "";
          void paintSlots();
        }
      });
      selectedDate = booking.slotDate;
      void paintSlots();
    })
    .catch((err) => {
      message.textContent = err.message || "Could not load dates.";
    });
}

export function attachRescheduleActions(root) {
  if (!root) return;
  root.querySelectorAll("[data-reschedule-booking]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const payload = btn.closest("[data-booking-id]");
      if (!payload) return;
      const booking = {
        id: payload.dataset.bookingId,
        offeringId: payload.dataset.offeringId,
        slotDate: payload.dataset.slotDate
      };
      openDialog(booking, () => {
        document.dispatchEvent(new CustomEvent("kk:bookings-changed"));
      });
    });
  });
}
