import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { getDb } from "../src/db.mjs";
import { squareConfig } from "../src/square-config.mjs";
import { startSquareConnect, completeSquareConnect, resetSquareStatusCache } from "../src/square-oauth.mjs";
import {
  createPaymentLink,
  listPaymentLinks,
  checkPaymentLink,
  handleSquareWebhook,
  checkWaitingLinks
} from "../src/square-payments.mjs";
import { fakeSquare, testEnv, coach } from "./square-fake.mjs";

const db = getDb();
const cfg = squareConfig(testEnv(), { production: false });

function payment(overrides = {}) {
  return {
    id: "PAY_1",
    status: "COMPLETED",
    order_id: "ORDER_1",
    location_id: "LOC_1",
    amount_money: { amount: 3000, currency: "GBP" },
    total_money: { amount: 3000, currency: "GBP" },
    ...overrides
  };
}

function shop({ pay = payment(), linkUrl = "https://sandbox.square.link/u/abc123", handlers = {} } = {}) {
  return fakeSquare({
    handlers: {
      "POST /v2/online-checkout/payment-links": () => [
        200,
        { payment_link: { id: "LINK_1", version: 1, url: linkUrl, order_id: "ORDER_1", created_at: new Date().toISOString() } }
      ],
      "GET /v2/orders/ORDER_1": () => [200, { order: { id: "ORDER_1", state: "OPEN", tenders: pay ? [{ payment_id: pay.id }] : [] } }],
      [`GET /v2/payments/${pay?.id || "PAY_1"}`]: () => [200, { payment: pay }],
      ...handlers
    }
  });
}

beforeEach(async () => {
  for (const t of ["square_connection", "square_oauth_states", "square_merchant_lock", "square_payment_links"]) {
    db.prepare(`DELETE FROM ${t}`).run();
  }
  db.prepare("DELETE FROM processed_events WHERE event_id LIKE 'sq-%'").run();
  resetSquareStatusCache();
  const who = coach();
  const started = startSquareConnect({ db, cfg, coach: who });
  const state = new URL(started.json.url).searchParams.get("state");
  const done = await completeSquareConnect({ db, cfg, coach: who, input: { code: "good-code", state }, fetchImpl: fakeSquare().fetchImpl });
  assert.equal(done.status, 200);
});

async function newLink(sq = shop(), input = { description: "Deposit: Profhilo", amountPence: 3000, clientName: "Sophie" }) {
  const r = await createPaymentLink({ db, cfg, input, fetchImpl: sq.fetchImpl });
  return { r, sq };
}

function signed(body, { key = "test-signature-key", url = cfg.webhookUrl } = {}) {
  const raw = Buffer.from(JSON.stringify(body));
  const signature = createHmac("sha256", key).update(url + raw.toString("utf8")).digest("base64");
  return { raw, signature };
}

function paymentEvent(id, pay = payment()) {
  return { event_id: id, type: "payment.updated", merchant_id: "MERCHANT_RACHEL", data: { type: "payment", id: pay.id, object: { payment: pay } } };
}

test("amounts and descriptions are validated on the server", async () => {
  const sq = shop();
  for (const input of [
    { description: "x", amountPence: 99 },
    { description: "x", amountPence: 200001 },
    { description: "x", amountPence: 10.5 },
    { description: "", amountPence: 1000 },
    { description: "a".repeat(121), amountPence: 1000 },
    { description: "x", amountPence: "1000" }
  ]) {
    const r = await createPaymentLink({ db, cfg, input, fetchImpl: sq.fetchImpl });
    assert.equal(r.status, 400, JSON.stringify(input));
  }
  assert.equal(sq.calls.length, 0, "nothing invalid reaches Square");
});

test("a link is created with the seller's token and location, in GBP, without tipping", async () => {
  const { r, sq } = await newLink();
  assert.equal(r.status, 201, JSON.stringify(r.json));
  assert.equal(r.json.link.url, "https://sandbox.square.link/u/abc123");
  assert.equal(r.json.link.status, "waiting");
  const call = sq.calls.find((c) => c.key === "POST /v2/online-checkout/payment-links");
  assert.equal(call.headers.Authorization, "Bearer access-1");
  assert.equal(call.body.order.location_id, "LOC_1");
  assert.equal(call.body.order.line_items[0].base_price_money.amount, 3000);
  assert.equal(call.body.order.line_items[0].base_price_money.currency, "GBP");
  assert.equal(call.body.checkout_options.allow_tipping, false);
  assert.equal(call.body.idempotency_key, r.json.link.id);
  assert.equal(call.body.order.reference_id, r.json.link.id);
});

test("a link from an unexpected host is refused and not offered to the client", async () => {
  const { r } = await newLink(shop({ linkUrl: "https://evil.example/pay" }));
  assert.equal(r.status, 502);
  assert.equal(listPaymentLinks(db).json.links[0].status, "failed");
});

test("Square being unavailable gives a retryable error", async () => {
  const down = shop({ handlers: { "POST /v2/online-checkout/payment-links": () => new Error("offline") } });
  const { r } = await newLink(down);
  assert.equal(r.status, 503);
});

test("creating a link needs a connected Square account", async () => {
  db.prepare("DELETE FROM square_connection").run();
  const { r } = await newLink();
  assert.equal(r.status, 409);
  assert.equal(r.json.code, "not_connected");
});

test("webhooks with a missing, wrong or wrong-URL signature are rejected", async () => {
  await newLink();
  const body = paymentEvent("sq-evt-1");
  const { raw } = signed(body);
  for (const signature of ["", "nonsense", signed(body, { key: "other" }).signature, signed(body, { url: "https://attacker.example/hook" }).signature]) {
    const r = await handleSquareWebhook({ db, cfg, raw, signature, fetchImpl: shop().fetchImpl });
    assert.equal(r.status, 403);
  }
  assert.equal(listPaymentLinks(db).json.links[0].status, "waiting");
});

test("only a verified, matching, completed payment marks a link paid, exactly once", async () => {
  await newLink();
  const body = paymentEvent("sq-evt-2");
  const { raw, signature } = signed(body);
  const sq = shop();
  const first = await handleSquareWebhook({ db, cfg, raw, signature, fetchImpl: sq.fetchImpl });
  assert.equal(first.status, 200);
  const link = listPaymentLinks(db).json.links[0];
  assert.equal(link.status, "paid");
  assert.ok(link.paidAt);
  assert.ok(sq.calls.some((c) => c.key === "GET /v2/payments/PAY_1"), "the payment is fetched from Square, not trusted from the event");

  const again = await handleSquareWebhook({ db, cfg, raw, signature, fetchImpl: sq.fetchImpl });
  assert.equal(again.status, 200);
  assert.equal(again.json.duplicate, true);
});

test("a payment that doesn't match amount, location, currency or status leaves the link waiting", async () => {
  const cases = [
    payment({ amount_money: { amount: 2999, currency: "GBP" } }),
    payment({ amount_money: { amount: 3000, currency: "USD" } }),
    payment({ location_id: "LOC_OTHER" }),
    payment({ status: "APPROVED" })
  ];
  let n = 0;
  for (const pay of cases) {
    db.prepare("DELETE FROM square_payment_links").run();
    await newLink();
    const { raw, signature } = signed(paymentEvent(`sq-evt-mismatch-${n++}`, payment()));
    const r = await handleSquareWebhook({ db, cfg, raw, signature, fetchImpl: shop({ pay }).fetchImpl });
    assert.equal(r.status, 200);
    assert.equal(listPaymentLinks(db).json.links[0].status, "waiting", JSON.stringify(pay));
  }
});

test("when Square can't be reached the webhook asks for a retry and records nothing", async () => {
  await newLink();
  const body = paymentEvent("sq-evt-3");
  const { raw, signature } = signed(body);
  const down = shop({ handlers: { "GET /v2/payments/PAY_1": () => new Error("offline") } });
  const r = await handleSquareWebhook({ db, cfg, raw, signature, fetchImpl: down.fetchImpl });
  assert.equal(r.status, 503);
  assert.equal(db.prepare("SELECT COUNT(*) AS c FROM processed_events WHERE event_id = 'sq-evt-3'").get().c, 0);
  const retry = await handleSquareWebhook({ db, cfg, raw, signature, fetchImpl: shop().fetchImpl });
  assert.equal(retry.status, 200);
  assert.equal(listPaymentLinks(db).json.links[0].status, "paid");
});

test("refunds show as refunded or partly refunded", async () => {
  await newLink();
  const paid = signed(paymentEvent("sq-evt-4"));
  await handleSquareWebhook({ db, cfg, ...paid, fetchImpl: shop().fetchImpl });
  const partial = payment({ refunded_money: { amount: 1000, currency: "GBP" } });
  const refundEvent = (id) => ({ event_id: id, type: "refund.updated", merchant_id: "MERCHANT_RACHEL", data: { object: { refund: { id: "REF_1", payment_id: "PAY_1", status: "COMPLETED" } } } });
  await handleSquareWebhook({ db, cfg, ...signed(refundEvent("sq-evt-5")), fetchImpl: shop({ pay: partial }).fetchImpl });
  assert.equal(listPaymentLinks(db).json.links[0].status, "partly_refunded");
  const full = payment({ refunded_money: { amount: 3000, currency: "GBP" } });
  await handleSquareWebhook({ db, cfg, ...signed(refundEvent("sq-evt-6")), fetchImpl: shop({ pay: full }).fetchImpl });
  assert.equal(listPaymentLinks(db).json.links[0].status, "refunded");
});

test("events for another Square business are ignored", async () => {
  await newLink();
  const body = { ...paymentEvent("sq-evt-7"), merchant_id: "MERCHANT_OTHER" };
  const r = await handleSquareWebhook({ db, cfg, ...signed(body), fetchImpl: shop().fetchImpl });
  assert.equal(r.status, 200);
  assert.equal(listPaymentLinks(db).json.links[0].status, "waiting");
});

test("Square removing access disconnects the account", async () => {
  const body = { event_id: "sq-evt-8", type: "oauth.authorization.revoked", merchant_id: "MERCHANT_RACHEL", data: { object: { revocation: {} } } };
  const r = await handleSquareWebhook({ db, cfg, ...signed(body), fetchImpl: shop().fetchImpl });
  assert.equal(r.status, 200);
  assert.equal(db.prepare("SELECT COUNT(*) AS c FROM square_connection").get().c, 0);
});

test("Check with Square finds a payment the webhook missed", async () => {
  const { r } = await newLink();
  const checked = await checkPaymentLink({ db, cfg, id: r.json.link.id, fetchImpl: shop().fetchImpl });
  assert.equal(checked.status, 200);
  assert.equal(checked.json.link.status, "paid");
});

test("Check with Square leaves an unpaid link waiting, and the daily job checks waiting links", async () => {
  const { r } = await newLink();
  const unpaid = shop({ pay: null });
  const checked = await checkPaymentLink({ db, cfg, id: r.json.link.id, fetchImpl: unpaid.fetchImpl });
  assert.equal(checked.json.link.status, "waiting");
  const n = await checkWaitingLinks({ db, cfg, fetchImpl: shop().fetchImpl });
  assert.equal(n, 1);
  assert.equal(listPaymentLinks(db).json.links[0].status, "paid");
});

test("visiting the success page is never treated as payment", async () => {
  // There is no endpoint that marks a link paid from a redirect: only the verified
  // webhook and Check with Square change status.
  const { r } = await newLink();
  assert.equal(listPaymentLinks(db).json.links.find((l) => l.id === r.json.link.id).status, "waiting");
});

test("the daily job also catches a refund whose webhook was missed", async () => {
  await newLink();
  await checkPaymentLink({ db, cfg, id: listPaymentLinks(db).json.links[0].id, fetchImpl: shop().fetchImpl });
  assert.equal(listPaymentLinks(db).json.links[0].status, "paid");
  const refunded = payment({ refunded_money: { amount: 3000, currency: "GBP" } });
  await checkWaitingLinks({ db, cfg, fetchImpl: shop({ pay: refunded }).fetchImpl });
  assert.equal(listPaymentLinks(db).json.links[0].status, "refunded");
});

test("a refund event that arrives before the payment is linked is matched by its order", async () => {
  await newLink();
  const refunded = payment({ refunded_money: { amount: 1000, currency: "GBP" } });
  const body = { event_id: "sq-evt-9", type: "refund.created", merchant_id: "MERCHANT_RACHEL", data: { object: { refund: { id: "REF_9", payment_id: "PAY_1", order_id: "ORDER_1", status: "PENDING" } } } };
  const r = await handleSquareWebhook({ db, cfg, ...signed(body), fetchImpl: shop({ pay: refunded }).fetchImpl });
  assert.equal(r.status, 200);
  assert.equal(listPaymentLinks(db).json.links[0].status, "partly_refunded");
});

test("a missing payment is not mistaken for a deleted link", async () => {
  const { r } = await newLink();
  const gone = shop({ handlers: { "GET /v2/payments/PAY_1": () => [404, { errors: [{ code: "NOT_FOUND" }] }] } });
  const checked = await checkPaymentLink({ db, cfg, id: r.json.link.id, fetchImpl: gone.fetchImpl });
  assert.notEqual(checked.status, 200);
  assert.equal(listPaymentLinks(db).json.links[0].status, "waiting");
  const deleted = shop({ handlers: { "GET /v2/orders/ORDER_1": () => [404, { errors: [{ code: "NOT_FOUND" }] }] } });
  const again = await checkPaymentLink({ db, cfg, id: r.json.link.id, fetchImpl: deleted.fetchImpl });
  assert.equal(again.json.link.status, "cancelled");
});

test("a payment whose order id differs is still matched through our reference on the order", async () => {
  const { r } = await newLink();
  const linkId = r.json.link.id;
  const otherOrderPay = payment({ order_id: "ORDER_2" });
  const sq = shop({
    pay: otherOrderPay,
    handlers: {
      "GET /v2/orders/ORDER_2": () => [200, { order: { id: "ORDER_2", reference_id: linkId, location_id: "LOC_1", tenders: [{ payment_id: "PAY_1" }] } }]
    }
  });
  const ok = await handleSquareWebhook({ db, cfg, ...signed(paymentEvent("sq-evt-10", otherOrderPay)), fetchImpl: sq.fetchImpl });
  assert.equal(ok.status, 200);
  assert.equal(listPaymentLinks(db).json.links[0].status, "paid");

  // An order that references some other id is still refused.
  db.prepare("DELETE FROM square_payment_links").run();
  await newLink();
  const stranger = shop({
    pay: otherOrderPay,
    handlers: { "GET /v2/orders/ORDER_2": () => [200, { order: { id: "ORDER_2", reference_id: "spl_someone-else", tenders: [] } }] }
  });
  await handleSquareWebhook({ db, cfg, ...signed(paymentEvent("sq-evt-11", otherOrderPay)), fetchImpl: stranger.fetchImpl });
  assert.equal(listPaymentLinks(db).json.links[0].status, "waiting");
});
