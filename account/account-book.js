/**
 * In-account treatment booking against Clockwork (Skin Den).
 */
import { SITE_CONFIG } from "../site-config.js";

function bookingApi() {
  return (SITE_CONFIG.booking?.apiUrl || "").replace(/\/$/, "");
}

function bookingSlug() {
  return SITE_CONFIG.booking?.slug || "the-skin-den";
}

function money(cents, currency = "gbp") {
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: currency.toUpperCase()
    }).format((cents || 0) / 100);
  } catch {
    return `£${((cents || 0) / 100).toFixed(2)}`;
  }
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export async function fetchCatalog() {
  const base = bookingApi();
  const slug = bookingSlug();
  if (!base) throw new Error("Booking is not configured.");
  const res = await fetch(`${base}/api/m/${encodeURIComponent(slug)}/catalog`, {
    credentials: "omit"
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Could not load treatments");
  return data;
}

async function fetchSlots({ serviceId, date, staffId = "anyone" }) {
  const base = bookingApi();
  const slug = bookingSlug();
  const q = new URLSearchParams({ date, serviceId, staffId });
  const res = await fetch(`${base}/api/m/${encodeURIComponent(slug)}/book?${q}`, {
    credentials: "omit"
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Could not load times");
  return data.slots || [];
}

async function createBooking(body) {
  const base = bookingApi();
  const slug = bookingSlug();
  const res = await fetch(`${base}/api/m/${encodeURIComponent(slug)}/book`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "omit",
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || "Booking failed");
    err.status = res.status;
    throw err;
  }
  return data;
}

function slotLabel(iso) {
  try {
    return new Date(iso).toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit"
    });
  } catch {
    return iso;
  }
}

/**
 * @param {HTMLElement} root
 * @param {{ user: { name?: string, email?: string }, onBooked?: () => void }} ctx
 */
export async function mountAccountBooking(root, ctx) {
  if (!root) return;
  root.replaceChildren();
  root.hidden = false;

  const status = document.createElement("p");
  status.className = "acct-muted";
  status.setAttribute("role", "status");
  status.textContent = "Loading treatments…";
  root.append(status);

  let catalog;
  try {
    catalog = await fetchCatalog();
  } catch (e) {
    status.textContent = e.message || "Treatments unavailable right now.";
    return;
  }

  status.remove();

  const head = document.createElement("div");
  head.className = "acct-panel-head";
  const h2 = document.createElement("h2");
  h2.className = "acct-subhead acct-subhead--inline";
  h2.textContent = "Book a treatment";
  head.append(h2);
  root.append(head);

  const note = document.createElement("p");
  note.className = catalog.paymentReady ? "acct-muted" : "acct-book-banner";
  if (catalog.paymentReady) {
    note.textContent = `50% deposit secures your booking (${catalog.depositPercent || 50}% of treatment). Apple Pay appears in Safari when your Wallet has a card.`;
  } else {
    note.append(
      document.createTextNode(
        "Online deposits (card / Apple Pay) are paused while we move to a new payments platform. Meanwhile "
      )
    );
    const wa = document.createElement("a");
    wa.href = "https://wa.me/447568602861";
    wa.textContent = "WhatsApp to book";
    note.append(wa, document.createTextNode("."));
  }
  root.append(note);

  if (!catalog.paymentReady) {
    return;
  }

  const grid = document.createElement("div");
  grid.className = "acct-treat-grid";
  root.append(grid);

  const detail = document.createElement("div");
  detail.className = "acct-book-detail";
  detail.hidden = true;
  root.append(detail);

  const payMount = document.createElement("div");
  payMount.className = "acct-book-pay";
  payMount.hidden = true;
  root.append(payMount);

  function showDetail(service) {
    detail.hidden = false;
    payMount.hidden = true;
    payMount.replaceChildren();
    detail.replaceChildren();

    const title = document.createElement("h3");
    title.className = "acct-book-detail__title";
    title.textContent = service.name;
    const meta = document.createElement("p");
    meta.className = "acct-muted";
    meta.textContent = `${service.durationMinutes} min · ${money(service.priceCents, catalog.currency)}`;
    detail.append(title, meta);

    const dateLabel = document.createElement("label");
    dateLabel.htmlFor = "acct-book-date";
    dateLabel.textContent = "Date";
    const dateInput = document.createElement("input");
    dateInput.type = "date";
    dateInput.id = "acct-book-date";
    dateInput.min = todayISO();
    dateInput.value = todayISO();
    dateInput.className = "acct-input";

    const slotsWrap = document.createElement("div");
    slotsWrap.className = "acct-slot-grid";
    const slotsStatus = document.createElement("p");
    slotsStatus.className = "acct-muted";
    slotsStatus.textContent = "Pick a date to see times.";

    const phoneLabel = document.createElement("label");
    phoneLabel.htmlFor = "acct-book-phone";
    phoneLabel.textContent = "Mobile (optional)";
    const phoneInput = document.createElement("input");
    phoneInput.type = "tel";
    phoneInput.id = "acct-book-phone";
    phoneInput.className = "acct-input";
    phoneInput.autocomplete = "tel";

    const notesLabel = document.createElement("label");
    notesLabel.htmlFor = "acct-book-notes";
    notesLabel.textContent = "Notes for Rachel (optional)";
    const notesInput = document.createElement("textarea");
    notesInput.id = "acct-book-notes";
    notesInput.className = "acct-input";
    notesInput.rows = 2;

    const confirmBtn = document.createElement("button");
    confirmBtn.type = "button";
    confirmBtn.className = "acct-btn acct-btn--primary acct-btn--block";
    confirmBtn.textContent = catalog.paymentReady ? "Continue to deposit" : "Reserve this time";
    confirmBtn.disabled = true;

    let chosenSlot = null;

    async function loadTimes() {
      chosenSlot = null;
      confirmBtn.disabled = true;
      slotsWrap.replaceChildren();
      slotsStatus.textContent = "Loading times…";
      try {
        const slots = await fetchSlots({
          serviceId: service.id,
          date: dateInput.value
        });
        if (!slots.length) {
          slotsStatus.textContent = "No times left that day — try another date.";
          return;
        }
        slotsStatus.textContent = "Choose a time";
        slots.forEach((slot) => {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "acct-slot";
          btn.textContent = slotLabel(slot.startsAt);
          btn.addEventListener("click", () => {
            slotsWrap.querySelectorAll(".acct-slot").forEach((el) => el.classList.remove("is-selected"));
            btn.classList.add("is-selected");
            chosenSlot = slot;
            confirmBtn.disabled = false;
          });
          slotsWrap.append(btn);
        });
      } catch (e) {
        slotsStatus.textContent = e.message || "Could not load times.";
      }
    }

    dateInput.addEventListener("change", () => void loadTimes());
    void loadTimes();

    confirmBtn.addEventListener("click", async () => {
      if (!chosenSlot || !ctx?.user?.email) return;
      confirmBtn.disabled = true;
      confirmBtn.textContent = "Booking…";
      try {
        const result = await createBooking({
          guestName: (ctx.user.name || ctx.user.email.split("@")[0] || "Client").trim(),
          guestEmail: String(ctx.user.email).trim(),
          guestPhone: phoneInput.value.trim() || undefined,
          notes: notesInput.value.trim() || undefined,
          serviceId: service.id,
          staffId: chosenSlot.staffId || "anyone",
          startsAt: chosenSlot.startsAt,
          honeypot: ""
        });

        if (result.clientSecret && catalog.stripePublishableKey) {
          await showStripePay(payMount, {
            clientSecret: result.clientSecret,
            publishableKey: catalog.stripePublishableKey,
            reference: result.reference,
            amountCents: result.amountCents,
            currency: result.currency || catalog.currency,
            onDone: () => {
              detail.hidden = true;
              payMount.hidden = true;
              ctx.onBooked?.();
            }
          });
          payMount.hidden = false;
          return;
        }

        if (result.confirmed || result.reference) {
          const ok = document.createElement("p");
          ok.className = "acct-book-success";
          ok.textContent = `Booked — reference ${result.reference}. See it under Your appointments.`;
          detail.prepend(ok);
          ctx.onBooked?.();
        }
      } catch (e) {
        const errEl = document.createElement("p");
        errEl.className = "acct-book-error";
        errEl.textContent = e.message || "Booking failed";
        detail.append(errEl);
      } finally {
        confirmBtn.disabled = !chosenSlot;
        confirmBtn.textContent = catalog.paymentReady
          ? "Continue to deposit"
          : "Reserve this time";
      }
    });

    detail.append(
      dateLabel,
      dateInput,
      slotsStatus,
      slotsWrap,
      phoneLabel,
      phoneInput,
      notesLabel,
      notesInput,
      confirmBtn
    );
    detail.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  (catalog.services || []).forEach((service) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "acct-treat-card";
    const name = document.createElement("span");
    name.className = "acct-treat-card__name";
    name.textContent = service.name;
    const meta = document.createElement("span");
    meta.className = "acct-treat-card__meta";
    meta.textContent = `${service.durationMinutes} min · ${money(service.priceCents, catalog.currency)}`;
    card.append(name, meta);
    card.addEventListener("click", () => showDetail(service));
    grid.append(card);
  });
}

async function showStripePay(root, opts) {
  const { clientSecret, publishableKey, reference, amountCents, currency, onDone } = opts;
  root.replaceChildren();
  const title = document.createElement("h3");
  title.textContent = "Pay deposit";
  const lede = document.createElement("p");
  lede.className = "acct-muted";
  lede.textContent = `${money(amountCents, currency)} · ref ${reference}`;
  const form = document.createElement("form");
  form.id = "acct-stripe-form";
  const mount = document.createElement("div");
  mount.id = "acct-payment-element";
  const btn = document.createElement("button");
  btn.type = "submit";
  btn.className = "acct-btn acct-btn--primary acct-btn--block";
  btn.textContent = "Pay now";
  const err = document.createElement("p");
  err.className = "acct-book-error";
  err.hidden = true;
  form.append(mount, btn, err);
  root.append(title, lede, form);

  await loadStripeJs();
  const stripe = window.Stripe(publishableKey);
  const elements = stripe.elements({ clientSecret });
  const paymentElement = elements.create("payment", {
    wallets: { applePay: "auto", googlePay: "auto" },
  });
  paymentElement.mount("#acct-payment-element");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    btn.disabled = true;
    btn.textContent = "Processing…";
    err.hidden = true;
    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: "if_required",
      confirmParams: { return_url: `${location.origin}/account/` }
    });
    if (error) {
      err.hidden = false;
      err.textContent = error.message || "Payment failed";
      btn.disabled = false;
      btn.textContent = "Pay now";
      return;
    }
    if (paymentIntent?.status === "succeeded" || paymentIntent?.status === "processing") {
      root.replaceChildren();
      const ok = document.createElement("p");
      ok.className = "acct-book-success";
      ok.textContent = `Deposit paid — you're booked (ref ${reference}).`;
      root.append(ok);
      onDone?.();
    }
  });
}

function loadStripeJs() {
  if (window.Stripe) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://js.stripe.com/v3/";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Could not load Stripe"));
    document.head.appendChild(s);
  });
}
