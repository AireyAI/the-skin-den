import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { parseAmountToPence, formatPence, statusLabel, paymentMessage } from "../admin/js/square-ui.mjs";

test("amounts typed in pounds become whole pence; anything else is refused", () => {
  assert.equal(parseAmountToPence("30"), 3000);
  assert.equal(parseAmountToPence("£30.50"), 3050);
  assert.equal(parseAmountToPence(" 1,200.5 "), 120050);
  assert.equal(parseAmountToPence("0.1"), 10);
  for (const bad of ["", "abc", "30.555", "-5", "1e3", "£", null, undefined]) {
    assert.equal(parseAmountToPence(bad), null, String(bad));
  }
});

test("pence are shown as pounds", () => {
  assert.equal(formatPence(3000), "£30.00");
  assert.equal(formatPence(120050), "£1,200.50");
});

test("every link status has a plain label", () => {
  assert.equal(statusLabel("waiting").label, "Waiting");
  assert.equal(statusLabel("paid").label, "Paid");
  assert.equal(statusLabel("partly_refunded").label, "Partly refunded");
  assert.equal(statusLabel("refunded").label, "Refunded");
  assert.equal(statusLabel("failed").label, "Not created");
  assert.equal(statusLabel("something_new").label, "Something new");
});

test("the WhatsApp message greets the client by first name and includes the link", () => {
  const text = paymentMessage({ clientName: "Sophie Reid", description: "Deposit: Profhilo", amountPence: 10000, url: "https://square.link/u/x" });
  assert.match(text, /^Hi Sophie,/);
  assert.ok(text.includes("Deposit: Profhilo"));
  assert.ok(text.includes("£100.00"));
  assert.ok(text.endsWith("https://square.link/u/x"));
  assert.match(paymentMessage({ description: "Facial", amountPence: 5000, url: "u" }), /^Hi,/);
});

function runInlineScrub(href) {
  const html = readFileSync(new URL("../admin/index.html", import.meta.url), "utf8");
  const match = html.match(/<script id="square-return">([\s\S]*?)<\/script>/);
  assert.ok(match, "admin/index.html must contain the inline square-return script");
  const head = html.slice(0, html.indexOf(match[0]));
  assert.equal(/<script\b|<link\b[^>]*stylesheet/.test(head.replace(/<script id="square-return">/, "")), false, "it must run before any other script or stylesheet");
  let replaced = null;
  const url = new URL(href);
  const window = {};
  const context = {
    window,
    URL,
    location: { href, pathname: url.pathname, hash: url.hash },
    history: { replaceState: (_s, _t, next) => { replaced = next; } }
  };
  vm.runInNewContext(match[1], context);
  return { saved: window.__squareReturn, replaced };
}

test("the dashboard clears Square's code and state from the address before anything else loads", () => {
  const { saved, replaced } = runInlineScrub("https://theskinden.co.uk/admin/?code=sq0cgp-abc&state=xyz123&response_type=code#top");
  assert.deepEqual({ ...saved }, { code: "sq0cgp-abc", state: "xyz123", error: null });
  assert.equal(replaced, "/admin/#top");
});

test("a declined Square sign-in is captured and cleared too", () => {
  const { saved, replaced } = runInlineScrub("https://theskinden.co.uk/admin/?error=access_denied&error_description=user+denied&state=s1");
  assert.equal(saved.error, "access_denied");
  assert.equal(replaced, "/admin/");
});

test("a normal visit is left alone", () => {
  const { saved, replaced } = runInlineScrub("https://theskinden.co.uk/admin/?tab=clients");
  assert.equal(saved, undefined);
  assert.equal(replaced, null);
});

test("the dashboard's Content Security Policy allows exactly the inline Square script", async () => {
  const { createHash } = await import("node:crypto");
  const html = readFileSync(new URL("../admin/index.html", import.meta.url), "utf8");
  const script = html.match(/<script id="square-return">([\s\S]*?)<\/script>/)[1];
  const hash = createHash("sha256").update(script, "utf8").digest("base64");
  const csp = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/)[1];
  assert.ok(csp.includes(`'sha256-${hash}'`), "update the CSP hash after editing the inline script");
  assert.ok(!/unsafe-inline|unsafe-eval/.test(csp));
  const otherInline = [...html.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>/g)].filter((m) => !m[1].includes('id="square-return"'));
  assert.equal(otherInline.length, 0, "no other inline scripts");
  assert.equal(/\son[a-z]+="/.test(html), false, "no inline event handlers");
});
