import { randomUUID } from "node:crypto";
import { getDb, membershipForUser } from "./db.mjs";
import { authMiddleware } from "./auth-routes.mjs";
import {
  getOffering,
  getPublicSchedule,
  getPublicScheduleInstances,
  getScheduleDocument,
  putScheduleDocument,
  resetScheduleFromSeed
} from "./schedule.mjs";
import {
  countBooked,
  resolveSlotDate,
  assertCapacityWithinTransaction,
  runBookingTransaction
} from "./booking-capacity.mjs";
import { performReschedule, bookingOwnedByUser } from "./booking-reschedule.mjs";
import { hit, clientKey } from "./rate-limit.mjs";

const MAX_CHECKOUT_CLASSES = 12;

function parseCheckoutItemList(body) {
  if (Array.isArray(body.items) && body.items.length) {
    return body.items.slice(0, MAX_CHECKOUT_CLASSES).map((row) => ({
      offeringId: row.offeringId || row.slotId,
      date: row.date
    }));
  }
  const single = body.offeringId || body.slotId;
  if (single) return [{ offeringId: single, date: body.date }];
  return [];
}

function customerFromCheckoutBody(body, req) {
  const auth = authMiddleware("member")(req);
  if (!auth.error) {
    const database = getDb();
    const user = database
      .prepare("SELECT id, email, name FROM users WHERE id = ?")
      .get(auth.payload.sub);
    if (user?.email) {
      const membership = membershipForUser(database, user.id);
      return {
        signedIn: true,
        userId: user.id,
        memberId: membership?.id || null,
        name: (user.name || membership?.name || user.email).trim(),
        email: user.email.trim().toLowerCase(),
        phone: String(body.phone || membership?.phone || "").trim()
      };
    }
  }
  return {
    signedIn: false,
    userId: null,
    memberId: null,
    name: (body.name || "").trim(),
    email: (body.email || "").trim().toLowerCase(),
    phone: (body.phone || "").trim()
  };
}

export function getPublicScheduleHandler() {
  return { status: 200, json: getPublicSchedule() };
}

export function getPublicScheduleInstancesHandler(req) {
  const url = new URL(req.url || "/", "http://local");
  const weeks = url.searchParams.get("weeks");
  return { status: 200, json: getPublicScheduleInstances(weeks) };
}

export async function getPublicPaymentsStatusHandler() {
  const { getConnectStatus } = await import("./stripe-status.mjs");
  const { getStripe, stripeSecretKeyProblem } = await import("./stripe-client.mjs");
  const status = await getConnectStatus({ fresh: true });
  const keyOk = !stripeSecretKeyProblem() && !!getStripe();
  // Checkout is refused unless Connect is ready, so readiness must not be
  // reported off the back of a mere Stripe key being present.
  return {
    status: 200,
    json: {
      readyForCheckout: !!status.readyForCheckout,
      connectReady: !!status.readyForCheckout,
      stripeConfigured: keyOk,
      platformCheckoutFallback: false,
      blockedReason: status.blockedReason || null,
      message: status.message || null
    }
  };
}

export function getAdminSchedule(req) {
  const auth = authMiddleware("coach")(req);
  if (auth.error) return { status: auth.status, json: { error: auth.error } };
  return { status: 200, json: getScheduleDocument() };
}

export function postAdminScheduleReset(req) {
  const auth = authMiddleware("coach")(req);
  if (auth.error) return { status: auth.status, json: { error: auth.error } };
  const doc = resetScheduleFromSeed();
  return { status: 200, json: doc };
}

export function putAdminSchedule(req, body) {
  const auth = authMiddleware("coach")(req);
  if (auth.error) return { status: auth.status, json: { error: auth.error } };
  try {
    const doc = putScheduleDocument(body);
    return { status: 200, json: doc };
  } catch (e) {
    return { status: 400, json: { error: e.message } };
  }
}

export async function postPublicCheckout(body, req) {
  const gate = hit(`booking-checkout:${clientKey(req)}`, { limit: 12, windowMs: 15 * 60 * 1000 });
  if (!gate.allowed) {
    return { status: 429, json: { error: "Too many booking attempts.", retryAfterSec: gate.retryAfterSec } };
  }

  const customer = customerFromCheckoutBody(body, req);
  const email = customer.email;
  const name = customer.name;
  const phone = customer.phone;

  if (!email || !name) {
    return {
      status: 400,
      json: {
        error: customer.signedIn
          ? "Your account is missing a name or email — update it under My account."
          : "Name and email are required."
      }
    };
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { status: 400, json: { error: "That email address does not look right." } };
  }
  if (!customer.signedIn && !phone) {
    return { status: 400, json: { error: "Add a phone number so we can reach you about your class." } };
  }

  const rawItems = parseCheckoutItemList(body);
  if (!rawItems.length) {
    return { status: 400, json: { error: "Pick at least one class." } };
  }

  const { getConnectStatus } = await import("./stripe-status.mjs");
  const { getStripe, stripeSecretKeyProblem } = await import("./stripe-client.mjs");
  if (stripeSecretKeyProblem()) {
    return {
      status: 503,
      json: { error: stripeSecretKeyProblem() }
    };
  }
  if (!getStripe()) {
    return { status: 503, json: { error: "Stripe is not configured on the server." } };
  }
  const connect = await getConnectStatus();
  if (!connect.readyForCheckout) {
    console.warn(
      `[platform-api] class checkout: Connect not ready (${connect.blockedReason || "pending"}) — using platform Checkout`
    );
  }

  const database = getDb();
  const lineItems = [];
  const pendingRows = [];
  const seen = new Set();

  for (const item of rawItems) {
    const offeringId = item.offeringId;
    if (!offeringId) continue;
    const offering = getOffering(offeringId);
    if (!offering) {
      return { status: 404, json: { error: "One of the classes could not be found." } };
    }
    const slotDate = resolveSlotDate(item.date, offering);
    if (!slotDate) {
      return {
        status: 400,
        json: { error: `Pick a valid ${offering.day} date for ${offering.time}.` }
      };
    }
    const key = `${offeringId}:${slotDate}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const bookingId = `bk_${randomUUID().slice(0, 12)}`;
    pendingRows.push({ bookingId, offeringId, slotDate, offering });
    lineItems.push({
      amountPence: offering.pricePence,
      productName: `${offering.title} · ${offering.day} ${offering.time}`
    });
  }

  if (!pendingRows.length) {
    return { status: 400, json: { error: "Pick at least one class." } };
  }

  try {
    runBookingTransaction(database, () => {
      assertCapacityWithinTransaction(
        database,
        pendingRows.map((row) => ({
          offeringId: row.offeringId,
          slotDate: row.slotDate,
          capacity: row.offering.capacity ?? 30
        }))
      );
    });
  } catch (e) {
    if (e?.status === 409) {
      return { status: 409, json: { error: e.message || "That class is full." } };
    }
    throw e;
  }

  const origin = config.publicSiteOrigin.replace(/\/$/, "");
  const bookingIds = pendingRows.map((r) => r.bookingId);
  const session = await createClassesCheckoutSession({
    lineItems,
    customerEmail: email,
    metadata: {
      booking_id: bookingIds[0],
      booking_ids: bookingIds.join(","),
      customer_name: name.slice(0, 80),
      customer_email: email,
      customer_phone: phone.slice(0, 40),
      tenant: "kettle-kulture",
      member_user_id: customer.userId || ""
    },
    successUrl: `${origin}/booking.html?booked=1&session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${origin}/booking.html?cancelled=1`
  });

  const insert = database.prepare(
    `INSERT INTO class_bookings (
        id, offering_id, slot_date, customer_name, customer_email, customer_phone,
        stripe_session_id, status, price_pence, member_id, created_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?)`
  );
  const now = new Date().toISOString();
  for (const row of pendingRows) {
    insert.run(
      row.bookingId,
      row.offeringId,
      row.slotDate,
      name,
      email,
      phone || null,
      session.id,
      "pending",
      row.offering.pricePence,
      customer.memberId,
      now
    );
  }

  return {
    status: 200,
    json: {
      checkoutUrl: session.url,
      bookingId: bookingIds[0],
      bookingIds,
      classCount: bookingIds.length
    }
  };
}

export async function postStripeConnectLink(req) {
  const auth = authMiddleware("coach")(req);
  if (auth.error) return { status: auth.status, json: { error: auth.error } };

  const keyProblem = stripeSecretKeyProblem();
  if (keyProblem) {
    return { status: 503, json: { error: keyProblem } };
  }
  if (!getStripe()) {
    return { status: 503, json: { error: "Stripe is not configured on the server." } };
  }
  if (config.stripeSecretKey.startsWith("rk_")) {
    return {
      status: 503,
      json: {
        error:
          "Stripe Connect needs the full platform secret key (sk_live_…) on the server. The current restricted key (rk_live) cannot open payout setup — update Railway STRIPE_SECRET_KEY."
      }
    };
  }

  const origin = config.publicSiteOrigin.replace(/\/$/, "");
  const stripe = getStripe();

  async function ensureConnectAccountId() {
    let accountId = getStripeConnectAccountId();
    if (accountId) {
      try {
        await stripe.accounts.retrieve(accountId);
        return accountId;
      } catch (e) {
        if (!isStaleConnectAccountError(e.message)) throw e;
        clearStripeConnectAccountId();
        console.warn(
          `[platform-api] Connect account ${accountId} is not on this platform — creating a new Express account.`
        );
      }
    }
    const account = await createExpressConnectAccount(config.coachEmail);
    setStripeConnectAccountId(account.id);
    clearConnectStatusCache();
    return account.id;
  }

  try {
    const accountId = await ensureConnectAccountId();
    const acct = await stripe.accounts.retrieve(accountId);
    const live = connectAccountLive(acct);

    if (live) {
      clearConnectStatusCache();
      const login = await createExpressDashboardLink(accountId);
      return {
        status: 200,
        json: {
          url: login.url,
          connectAccountId: accountId,
          readyForCheckout: true,
          linkKind: "express_dashboard",
          message: "Stripe is connected. Opening your Express dashboard to manage payouts."
        }
      };
    }

    const link = await createConnectAccountLink(
      accountId,
      `${origin}/admin/?stripe=refresh`,
      `${origin}/admin/?stripe=return`,
      { type: "account_onboarding" }
    );

    clearConnectStatusCache();

    return {
      status: 200,
      json: {
        url: link.url,
        connectAccountId: accountId,
        readyForCheckout: false,
        linkKind: "account_onboarding",
        message: "Complete Stripe Express setup (bank + ID) — about five minutes."
      }
    };
  } catch (e) {
    const msg =
      e?.raw?.message ||
      e?.message ||
      "Could not start Stripe Connect. Check platform Stripe keys on the server.";
    console.error("[platform-api] Stripe Connect link failed:", msg);
    return { status: 502, json: { error: msg } };
  }
}

function bookingIdsFromSession(session) {
  const list = session.metadata?.booking_ids;
  if (list) {
    return list
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  const one = session.metadata?.booking_id;
  return one ? [one] : [];
}

function markOneBookingPaid(database, session, bookingId, memberCache) {
  if (session.payment_status && session.payment_status !== "paid") {
    return { handled: false, reason: "payment_not_paid", paymentStatus: session.payment_status, bookingId };
  }

  const existing = database
    .prepare("SELECT status, price_pence, slot_date FROM class_bookings WHERE id = ?")
    .get(bookingId);
  if (!existing) return { handled: false, reason: "booking_not_found", bookingId };
  if (existing.status === "paid") {
    return { handled: true, duplicate: true, bookingId };
  }

  const paymentRef = session.payment_intent || session.id;
  const ledgerDup = database
    .prepare("SELECT id FROM payment_events WHERE reference_id = ? LIMIT 1")
    .get(bookingId);
  if (ledgerDup) {
    return { handled: true, duplicate: true, bookingId };
  }

  const email = session.metadata?.customer_email || session.customer_details?.email;
  const name = session.metadata?.customer_name || session.customer_details?.name || "";
  const phone = session.metadata?.customer_phone || "";
  const slotDate = existing.slot_date || session.metadata?.slot_date;
  let member = memberCache?.member;
  if (!member) {
    member = ensureMemberFromClassPayment(database, {
      email,
      name,
      phone,
      stripeCustomerId: typeof session.customer === "string" ? session.customer : session.customer?.id,
      slotDate
    });
    if (memberCache) memberCache.member = member;
  }

  const now = new Date().toISOString();
  const upd = database
    .prepare(
      `UPDATE class_bookings SET status = 'paid', stripe_payment_intent = ?, member_id = ?, updated_at = ? WHERE id = ? AND status != 'paid'`
    )
    .run(paymentRef, member?.id || null, now, bookingId);

  if (!upd.changes) {
    return { handled: true, duplicate: true, bookingId };
  }

  const amountPence = existing.price_pence || 0;
  if (amountPence <= 0) {
    return { handled: true, bookingId, memberId: member?.id, warning: "zero_amount" };
  }

  const feeBps = config.platformFeeBps;
  const platformFeePence = Math.floor((amountPence * feeBps) / 10000);
  recordPaymentEvent(database, {
    id: `pay_${randomUUID().slice(0, 12)}`,
    source: "class_booking",
    referenceId: bookingId,
    memberId: member?.id,
    amountPence,
    platformFeePence,
    status: "paid",
    stripePaymentIntent: paymentRef,
    customerEmail: email
  });

  return { handled: true, bookingId, memberId: member?.id };
}

export function markBookingPaid(database, session) {
  const bookingIds = bookingIdsFromSession(session);
  if (!bookingIds.length) return { handled: false };

  const memberCache = { member: null };
  const outcomes = [];
  for (const bookingId of bookingIds) {
    outcomes.push(markOneBookingPaid(database, session, bookingId, memberCache));
  }
  const anyPaid = outcomes.some((o) => o.handled && !o.duplicate && !o.reason);
  return {
    handled: true,
    bookingIds,
    memberId: memberCache.member?.id,
    outcomes,
    anyPaid
  };
}

export function markBookingExpired(database, session) {
  const bookingIds = bookingIdsFromSession(session);
  if (!bookingIds.length) return { handled: false };
  const now = new Date().toISOString();
  for (const bookingId of bookingIds) {
    const row = database.prepare("SELECT status FROM class_bookings WHERE id = ?").get(bookingId);
    if (row?.status === "pending") {
      database
        .prepare(`UPDATE class_bookings SET status = 'cancelled', updated_at = ? WHERE id = ?`)
        .run(now, bookingId);
    }
  }
  return { handled: true, bookingIds, status: "cancelled" };
}

function memberCanReserve(m) {
  if (!m) return { ok: false, error: "No membership on file — buy a class block or sign in after checkout." };
  const status = String(m.status || "").toLowerCase();
  if (!["active", "trialing", "past_due"].includes(status)) {
    return { ok: false, error: "Your membership is not active." };
  }
  if (m.packExpiresAt) {
    const exp = new Date(`${m.packExpiresAt}T23:59:59`);
    if (exp < new Date()) return { ok: false, error: "Your class block has expired." };
  }
  if (m.planType === "subscription") return { ok: true };
  if (m.packCredits != null) {
    if (m.packCredits <= 0) return { ok: false, error: "No classes left on your block." };
    return { ok: true };
  }
  return { ok: false, error: "Buy a drop-in or 8-class block to book." };
}

export function postMemberBookWithCredit(body, req) {
  const auth = authMiddleware("member")(req);
  if (auth.error) return { status: auth.status, json: { error: auth.error } };

  const rawItems = parseCheckoutItemList(body);
  if (!rawItems.length) return { status: 400, json: { error: "Pick at least one class." } };

  const database = getDb();
  const membership = membershipForUser(database, auth.payload.sub);
  const gate = memberCanReserve(membership);
  if (!gate.ok) return { status: 403, json: { error: gate.error } };

  if (membership?.planType !== "subscription" && membership?.packCredits != null) {
    const need = Math.min(rawItems.length, MAX_CHECKOUT_CLASSES);
    if (membership.packCredits < need) {
      return {
        status: 403,
        json: {
          error: `You only have ${membership.packCredits} class credit(s) left — pick fewer sessions or pay for drop-ins.`
        }
      };
    }
  }

  const user = database.prepare("SELECT email, name FROM users WHERE id = ?").get(auth.payload.sub);
  const pending = [];
  const seen = new Set();

  for (const item of rawItems) {
    const offeringId = item.offeringId;
    if (!offeringId) continue;
    const offering = getOffering(offeringId);
    if (!offering) return { status: 404, json: { error: "Class not found" } };
    const slotDate = resolveSlotDate(item.date, offering);
    if (!slotDate) {
      return { status: 400, json: { error: `Pick a valid ${offering.day} date within the next 90 days.` } };
    }
    const key = `${offeringId}:${slotDate}`;
    if (seen.has(key)) continue;
    seen.add(key);
    pending.push({ offeringId, slotDate, offering });
  }

  if (!pending.length) return { status: 400, json: { error: "Pick at least one class." } };

  let booked = [];
  try {
    runBookingTransaction(database, () => {
      assertCapacityWithinTransaction(
        database,
        pending.map((row) => ({
          offeringId: row.offeringId,
          slotDate: row.slotDate,
          capacity: row.offering.capacity ?? 30
        }))
      );
      const insert = database.prepare(
        `INSERT INTO class_bookings (
        id, offering_id, slot_date, customer_name, customer_email, customer_phone,
        stripe_session_id, status, price_pence, member_id, created_at, updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
      );
      const now = new Date().toISOString();
      for (const row of pending) {
        const bookingId = `bk_${randomUUID().slice(0, 12)}`;
        insert.run(
          bookingId,
          row.offeringId,
          row.slotDate,
          user?.name || "Member",
          (membership?.email || user?.email || "").toLowerCase(),
          null,
          null,
          "booked",
          0,
          membership?.id || null,
          now,
          now
        );
        booked.push({
          bookingId,
          classTitle: row.offering.title,
          slotDate: row.slotDate,
          day: row.offering.day,
          time: row.offering.time
        });
      }
    });
  } catch (e) {
    if (e?.status === 409) return { status: 409, json: { error: e.message || "That class is full." } };
    throw e;
  }

  return {
    status: 200,
    json: {
      bookingIds: booked.map((b) => b.bookingId),
      count: booked.length,
      status: "booked",
      message:
        booked.length === 1
          ? "Your place is reserved. Show your member QR at the door — one class credit is used when you check in."
          : `${booked.length} places reserved. Show your member QR at the door — credits are used when you check in.`
    }
  };
}



export async function patchMemberBookingReschedule(bookingId, body, req) {
  const auth = authMiddleware("member")(req);
  if (auth.error) return { status: auth.status, json: { error: auth.error } };
  const database = getDb();
  const user = database.prepare("SELECT id, email FROM users WHERE id = ?").get(auth.payload.sub);
  if (!user?.email) return { status: 404, json: { error: "User not found" } };
  const membership = membershipForUser(database, user.id);
  const { getBookingById } = await import("./bookings-db.mjs");
  const booking = getBookingById(database, bookingId);
  if (!bookingOwnedByUser(booking, {
    userId: user.id,
    userEmail: user.email,
    memberId: membership?.id || null
  })) {
    return { status: 403, json: { error: "This booking is not on your account." } };
  }
  return performReschedule(
    database,
    bookingId,
    { offeringId: body.offeringId || body.slotId, date: body.date || body.slotDate },
    { actorUserId: user.id }
  );
}

export function patchAdminBookingReschedule(bookingId, body, req) {
  const auth = authMiddleware("coach")(req);
  if (auth.error) return { status: auth.status, json: { error: auth.error } };
  const database = getDb();
  return performReschedule(
    database,
    bookingId,
    { offeringId: body.offeringId || body.slotId, date: body.date || body.slotDate },
    { actorCoachId: auth.payload.sub }
  );
}

export async function getAdminBookingsRoster(req) {
  const auth = authMiddleware("coach")(req);
  if (auth.error) return { status: auth.status, json: { error: auth.error } };
  const url = new URL(req.url || "/", "http://local");
  const from = url.searchParams.get("from") || "";
  const to = url.searchParams.get("to") || "";
  const q = url.searchParams.get("q") || "";
  const database = getDb();
  const { listBookingsForRoster } = await import("./bookings-db.mjs");
  const { getOffering } = await import("./schedule.mjs");
  const bookings = listBookingsForRoster(database, { from, to, q });
  const byDate = new Map();
  for (const b of bookings) {
    const offering = getOffering(b.offeringId);
    const key = `${b.slotDate}:${b.offeringId}`;
    if (!byDate.has(key)) {
      byDate.set(key, {
        slotDate: b.slotDate,
        offeringId: b.offeringId,
        title: offering?.title || "Class",
        time: offering?.time || "",
        day: offering?.day || "",
        capacity: offering?.capacity ?? 30,
        bookings: []
      });
    }
    byDate.get(key).bookings.push(b);
  }
  const groups = [...byDate.values()].map((g) => ({
    ...g,
    booked: g.bookings.filter((x) => x.status !== "cancelled").length,
    remaining: Math.max(0, g.capacity - g.bookings.filter((x) => x.status !== "cancelled").length)
  }));
  groups.sort((a, b) => a.slotDate.localeCompare(b.slotDate) || a.time.localeCompare(b.time));
  return { status: 200, json: { groups, bookings } };
}
