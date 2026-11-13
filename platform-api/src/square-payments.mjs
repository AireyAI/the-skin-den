import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { squareConfigProblems } from "./square-config.mjs";
import { squareRequest, SquareError } from "./square-api.mjs";
import { getConnectionRow, sellerAccess, clearSquareForRevokedMerchant } from "./square-oauth.mjs";

const MIN_PENCE = 100;
const MAX_PENCE = 200_000;
const LINK_HOSTS = new Set(["square.link", "sandbox.square.link", "checkout.square.site", "sandbox.checkout.square.site"]);
const WAITING_CHECK_DAYS = 30;

const ok = (json, status = 200) => ({ status, json });
const fail = (status, code, error) => ({ status, json: { error, code } });

function publicLink(row) {
  return {
    id: row.id,
    clientName: row.client_name || "",
    memberId: row.member_id || null,
    description: row.description,
    amountPence: row.amount_pence,
    currency: row.currency,
    status: row.status,
    url: row.status === "failed" ? null : row.url,
    refundedPence: row.refunded_pence,
    createdAt: row.created_at,
    paidAt: row.paid_at,
    checkedAt: row.checked_at
  };
}

const linkById = (db, id) => db.prepare("SELECT * FROM square_payment_links WHERE id = ?").get(id) || null;

function validLinkInput(input) {
  const description = typeof input?.description === "string" ? input.description.trim() : "";
  const clientName = typeof input?.clientName === "string" ? input.clientName.trim() : "";
  const memberId = typeof input?.memberId === "string" ? input.memberId.trim() : "";
  const amount = input?.amountPence;
  if (!Number.isInteger(amount) || amount < MIN_PENCE || amount > MAX_PENCE) {
    return { error: "Enter an amount between £1 and £2,000." };
  }
  if (!description || description.length > 120) return { error: "Add a short description (up to 120 characters)." };
  if (clientName.length > 80 || memberId.length > 64) return { error: "That client name is too long." };
  return { value: { description, clientName, memberId, amount } };
}

function trustedLinkUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && LINK_HOSTS.has(url.hostname) ? url.href : null;
  } catch {
    return null;
  }
}

async function seller(db, cfg, fetchImpl) {
  if (squareConfigProblems(cfg).length) return { error: fail(503, "not_configured", "Square isn't set up on the studio server yet.") };
  if (!getConnectionRow(db)) return { error: fail(409, "not_connected", "Connect your Square account first.") };
  try {
    return { access: await sellerAccess({ db, cfg, fetchImpl }) };
  } catch (e) {
    if (e.transient) return { error: fail(503, "unavailable", "Square couldn't be reached. Try again in a moment.") };
    return { error: fail(409, "reconnect", "Square access needs renewing. Disconnect and connect Square again.") };
  }
}

export async function createPaymentLink({ db, cfg, input, fetchImpl = fetch, now = Date.now() }) {
  const checked = validLinkInput(input);
  if (checked.error) return fail(400, "input", checked.error);
  const { access, error } = await seller(db, cfg, fetchImpl);
  if (error) return error;

  const { description, clientName, memberId, amount } = checked.value;
  const id = `spl_${randomUUID()}`;
  const stamp = new Date(now).toISOString();
  db.prepare(
    `INSERT INTO square_payment_links (id, member_id, client_name, description, amount_pence, currency, status, merchant_id, location_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'GBP', 'creating', ?, ?, ?, ?)`
  ).run(id, memberId || null, clientName || null, description, amount, access.merchantId, access.locationId, stamp, stamp);

  const markFailed = () =>
    db.prepare("UPDATE square_payment_links SET status = 'failed', updated_at = ? WHERE id = ?").run(new Date().toISOString(), id);

  const request = () =>
    squareRequest(cfg, "/v2/online-checkout/payment-links", {
      method: "POST",
      token: access.accessToken,
      body: {
        idempotency_key: id,
        order: {
          location_id: access.locationId,
          reference_id: id,
          line_items: [{ name: description, quantity: "1", base_price_money: { amount, currency: "GBP" } }]
        },
        checkout_options: { allow_tipping: false },
        payment_note: description
      },
      fetchImpl
    });
  let link;
  try {
    // A timeout may still have created the link, so retry once with the same idempotency
    // key: Square then returns that same link instead of making a second one.
    ({ payment_link: link } = await request().catch((e) => (e.transient ? request() : Promise.reject(e))));
  } catch (e) {
    markFailed();
    return e.transient
      ? fail(503, "unavailable", "Square didn't respond. Check your Square payment links before trying again, in case it was created.")
      : fail(502, "square", "Square couldn't create that link. Please try again.");
  }
  const url = trustedLinkUrl(link?.url);
  if (!url || !link?.id || !link?.order_id) {
    markFailed();
    return fail(502, "square", "Square returned an unexpected link, so it wasn't saved.");
  }
  db.prepare(
    "UPDATE square_payment_links SET status = 'waiting', square_link_id = ?, square_order_id = ?, url = ?, updated_at = ? WHERE id = ?"
  ).run(link.id, link.order_id, url, new Date().toISOString(), id);
  return ok({ link: publicLink(linkById(db, id)) }, 201);
}

const RECEIVED_STATUSES = "('paid', 'partly_refunded', 'refunded')";

export function listPaymentLinks(db, { limit = 200, now = Date.now() } = {}) {
  const rows = db.prepare("SELECT * FROM square_payment_links ORDER BY created_at DESC LIMIT ?").all(limit);
  const since = new Date(now - 30 * 86400000).toISOString();
  const received = db
    .prepare(`SELECT COALESCE(SUM(amount_pence - refunded_pence), 0) AS pence FROM square_payment_links WHERE status IN ${RECEIVED_STATUSES} AND paid_at >= ?`)
    .get(since);
  return ok({ links: rows.map(publicLink), paid30dPence: received.pence });
}

/**
 * The status a link should have, given the payment as Square reports it. Returns null
 * when the payment does not belong to this link or is not a completed GBP payment of
 * exactly the requested amount.
 */
function statusFromPayment(row, payment, referencedOrderId = null) {
  const amount = payment?.amount_money;
  const orderMatches = payment?.order_id === row.square_order_id || (referencedOrderId && payment?.order_id === referencedOrderId);
  if (
    payment?.status !== "COMPLETED" ||
    !orderMatches ||
    payment.location_id !== row.location_id ||
    amount?.currency !== "GBP" ||
    amount?.amount !== row.amount_pence
  ) {
    return null;
  }
  const refunded = payment.refunded_money?.currency === "GBP" ? payment.refunded_money.amount || 0 : 0;
  if (refunded >= row.amount_pence) return { status: "refunded", refunded };
  if (refunded > 0) return { status: "partly_refunded", refunded };
  return { status: "paid", refunded: 0 };
}

function applyPayment(db, row, payment, outcome, { eventId, eventType, now }) {
  const stamp = new Date(now).toISOString();
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare(
      `UPDATE square_payment_links
         SET status = ?, square_payment_id = ?, refunded_pence = ?, paid_at = COALESCE(paid_at, ?), checked_at = ?, updated_at = ?
       WHERE id = ?`
    ).run(outcome.status, payment.id, outcome.refunded, stamp, stamp, stamp, row.id);
    if (eventId) {
      db.prepare("INSERT OR IGNORE INTO processed_events (event_id, type, processed_at) VALUES (?, ?, ?)").run(eventId, eventType, stamp);
    }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

function recordEvent(db, eventId, type, now) {
  if (!eventId) return;
  db.prepare("INSERT OR IGNORE INTO processed_events (event_id, type, processed_at) VALUES (?, ?, ?)").run(eventId, type, new Date(now).toISOString());
}

async function fetchPayment(cfg, access, paymentId, fetchImpl) {
  const { payment } = await squareRequest(cfg, `/v2/payments/${encodeURIComponent(paymentId)}`, { token: access.accessToken, fetchImpl });
  return payment;
}

export async function checkPaymentLink({ db, cfg, id, fetchImpl = fetch, now = Date.now() }) {
  const row = linkById(db, id);
  if (!row || !row.square_order_id) return fail(404, "not_found", "That payment link wasn't found.");
  const { access, error } = await seller(db, cfg, fetchImpl);
  if (error) return error;
  let order;
  try {
    ({ order } = await squareRequest(cfg, `/v2/orders/${encodeURIComponent(row.square_order_id)}`, { token: access.accessToken, fetchImpl }));
  } catch (e) {
    if (e instanceof SquareError && e.status === 404) {
      // The order no longer exists in Square, so the link was deleted there.
      const stamp = new Date(now).toISOString();
      db.prepare("UPDATE square_payment_links SET status = 'cancelled', checked_at = ?, updated_at = ? WHERE id = ? AND status = 'waiting'").run(stamp, stamp, id);
      return ok({ link: publicLink(linkById(db, id)) });
    }
    return fail(e.transient ? 503 : 502, "square", "Square couldn't be checked just now. Try again in a moment.");
  }
  try {
    for (const tender of order?.tenders || []) {
      if (!tender.payment_id) continue;
      const payment = await fetchPayment(cfg, access, tender.payment_id, fetchImpl);
      const outcome = statusFromPayment(row, payment);
      if (outcome) {
        applyPayment(db, row, payment, outcome, { now });
        return ok({ link: publicLink(linkById(db, id)) });
      }
    }
  } catch (e) {
    return fail(e.transient ? 503 : 502, "square", "Square couldn't be checked just now. Try again in a moment.");
  }
  db.prepare("UPDATE square_payment_links SET checked_at = ? WHERE id = ?").run(new Date(now).toISOString(), id);
  return ok({ link: publicLink(linkById(db, id)) });
}

/**
 * Daily safety net for missed webhooks: re-checks recent links that are waiting or paid
 * (a refund may have been missed), and gives up on links that never finished creating.
 * Returns how many links were checked.
 */
export async function checkWaitingLinks({ db, cfg, fetchImpl = fetch, now = Date.now() }) {
  const stamp = new Date(now).toISOString();
  db.prepare("UPDATE square_payment_links SET status = 'failed', updated_at = ? WHERE status = 'creating' AND created_at < ?").run(
    stamp,
    new Date(now - 3600000).toISOString()
  );
  const since = new Date(now - WAITING_CHECK_DAYS * 86400000).toISOString();
  const rows = db
    .prepare("SELECT id FROM square_payment_links WHERE status IN ('waiting', 'paid', 'partly_refunded') AND created_at >= ?")
    .all(since);
  for (const { id } of rows) {
    await checkPaymentLink({ db, cfg, id, fetchImpl, now }).catch(() => null);
  }
  return rows.length;
}

function validSignature(cfg, raw, signature) {
  if (typeof signature !== "string" || !signature) return false;
  const expected = createHmac("sha256", cfg.webhookSignatureKey).update(cfg.webhookUrl + raw.toString("utf8")).digest("base64");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Square webhook. The payment is always fetched from Square with the seller's token
 * before anything changes, and the link update and event record commit together, so a
 * failed fetch is retried by Square rather than lost.
 */
export async function handleSquareWebhook({ db, cfg, raw, signature, fetchImpl = fetch, now = Date.now() }) {
  if (squareConfigProblems(cfg).length) return fail(503, "not_configured", "Square is not configured");
  if (!validSignature(cfg, raw, signature)) return fail(403, "signature", "Invalid signature");
  let event;
  try {
    event = JSON.parse(raw.toString("utf8"));
  } catch {
    return fail(400, "body", "Invalid JSON");
  }
  const eventId = typeof event?.event_id === "string" ? event.event_id : "";
  const type = event?.type || "";
  if (eventId && db.prepare("SELECT 1 FROM processed_events WHERE event_id = ?").get(eventId)) {
    return ok({ received: true, duplicate: true });
  }

  const connection = getConnectionRow(db);
  if (!connection || event?.merchant_id !== connection.merchant_id) {
    if (connection) console.warn(`[square] ignored ${type} for another merchant`);
    return ok({ received: true, ignored: true });
  }

  if (type === "oauth.authorization.revoked") {
    clearSquareForRevokedMerchant(db, event.merchant_id);
    recordEvent(db, eventId, type, now);
    return ok({ received: true });
  }

  let row = null;
  let paymentId = "";
  let referencedOrderId = null;
  if (type === "payment.created" || type === "payment.updated") {
    const p = event?.data?.object?.payment;
    paymentId = p?.id || "";
    row = p?.order_id ? db.prepare("SELECT * FROM square_payment_links WHERE square_order_id = ?").get(p.order_id) : null;
    if (!row && paymentId && p?.order_id) {
      // Fallback: if Square paid a different order id than the link reported, our link id
      // is still on that order as its reference.
      try {
        const access = await sellerAccess({ db, cfg, fetchImpl, now });
        const { order } = await squareRequest(cfg, `/v2/orders/${encodeURIComponent(p.order_id)}`, { token: access.accessToken, fetchImpl });
        const ref = typeof order?.reference_id === "string" ? order.reference_id : "";
        row = ref.startsWith("spl_") ? linkById(db, ref) : null;
        if (row) referencedOrderId = p.order_id;
      } catch (e) {
        if (e.transient) return fail(503, "unavailable", "Square unavailable; retry");
      }
    }
  } else if (type === "refund.created" || type === "refund.updated") {
    const refund = event?.data?.object?.refund;
    paymentId = refund?.payment_id || "";
    row =
      (paymentId && db.prepare("SELECT * FROM square_payment_links WHERE square_payment_id = ?").get(paymentId)) ||
      (refund?.order_id && db.prepare("SELECT * FROM square_payment_links WHERE square_order_id = ?").get(refund.order_id)) ||
      null;
  }
  if (!row || !paymentId) {
    recordEvent(db, eventId, type, now);
    return ok({ received: true, ignored: true });
  }

  let access;
  let payment;
  try {
    access = await sellerAccess({ db, cfg, fetchImpl, now });
    payment = await fetchPayment(cfg, access, paymentId, fetchImpl);
  } catch (e) {
    if (e.transient) return fail(503, "unavailable", "Square unavailable; retry");
    console.error(`[square] could not verify ${type} for link ${row.id}: ${e.message}`);
    return fail(503, "verify", "Could not verify payment; retry");
  }
  const outcome = statusFromPayment(row, payment, referencedOrderId);
  if (!outcome) {
    if (payment?.status === "COMPLETED") console.error(`[square] payment ${paymentId} does not match link ${row.id}; left for review`);
    recordEvent(db, eventId, type, now);
    return ok({ received: true, matched: false });
  }
  try {
    applyPayment(db, row, payment, outcome, { eventId, eventType: type, now });
  } catch (e) {
    console.error(`[square] could not save ${type} for link ${row.id}: ${e.message}`);
    return fail(503, "save", "Could not save; retry");
  }
  return ok({ received: true, status: outcome.status });
}
