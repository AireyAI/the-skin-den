import { formatDate } from "./membership-dates.js";

function statusLabel(status) {
  if (status === "paid" || status === "booked") return "Confirmed";
  if (status === "pending") return "Awaiting payment";
  return String(status || "").replace(/_/g, " ");
}

function formatClassWhen(booking) {
  if (booking.whenLabel) return booking.whenLabel;
  const day = formatDate(booking.slotDate);
  const time = booking.classTime ? ` · ${booking.classTime}` : "";
  return `${day}${time}`;
}

function bookingCard(booking) {
  const card = document.createElement("article");
  card.className = "member-booking-card";
  card.dataset.bookingId = booking.id;
  card.dataset.offeringId = booking.offeringId || "";
  card.dataset.slotDate = booking.slotDate || "";
  if (booking.status === "pending") card.classList.add("member-booking-card--pending");

  const title = document.createElement("h3");
  title.className = "member-booking-card__title";
  title.textContent = booking.classTitle || booking.treatmentTitle || "Appointment";

  const when = document.createElement("p");
  when.className = "member-booking-card__when";
  when.textContent = formatClassWhen(booking);

  const meta = document.createElement("p");
  meta.className = "member-booking-card__meta";
  meta.textContent = statusLabel(booking.status);
  if (booking.priceLabel && booking.status === "pending") {
    meta.textContent += ` · ${booking.priceLabel} at checkout`;
  }

  card.append(title, when, meta);

  const canReschedule =
    booking.isUpcoming !== false &&
    (booking.status === "paid" || booking.status === "booked");
  if (canReschedule) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "button button--ghost button--sm member-booking-card__reschedule";
    btn.dataset.rescheduleBooking = "";
    btn.textContent = "Change date";
    card.append(btn);
  }

  return card;
}

export function renderMemberBookings(payload, root) {
  if (!root) return;
  root.replaceChildren();

  const upcoming = payload?.upcoming || [];
  const past = payload?.past || [];

  if (!upcoming.length && !past.length) {
    const empty = document.createElement("p");
    empty.className = "acct-muted member-bookings-empty";
    empty.textContent =
      "No appointments on this account yet. Book on the studio page with the same email you sign in with (including Apple), then refresh.";
    root.append(empty);
    return;
  }

  if (upcoming.length) {
    const head = document.createElement("h3");
    head.className = "member-bookings-group";
    head.textContent = "Upcoming";
    root.append(head);
    upcoming.forEach((b) => root.append(bookingCard(b)));
  }

  if (past.length) {
    const head = document.createElement("h3");
    head.className = "member-bookings-group";
    head.textContent = "Recent";
    root.append(head);
    past.slice(0, 5).forEach((b) => root.append(bookingCard(b)));
  }
}
