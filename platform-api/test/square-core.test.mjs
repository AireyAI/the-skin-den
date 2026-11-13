import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { encryptTokens, decryptTokens } from "../src/square-crypto.mjs";
import { squareConfig, squareConfigProblems } from "../src/square-config.mjs";

const key = randomBytes(32).toString("base64");

test("encrypted tokens round-trip only with the same key and binding", () => {
  const aad = "app-1:sandbox:MERCHANT_A";
  const blob = encryptTokens(key, aad, { accessToken: "a", refreshToken: "r" });
  assert.ok(!blob.includes("\"a\""), "ciphertext must not contain the plain token");
  assert.deepEqual(decryptTokens(key, aad, blob), { accessToken: "a", refreshToken: "r" });
  assert.throws(() => decryptTokens(key, "app-1:sandbox:MERCHANT_B", blob));
  assert.throws(() => decryptTokens(randomBytes(32).toString("base64"), aad, blob));
});

test("each encryption uses a fresh IV", () => {
  const aad = "app:sandbox:M";
  assert.notEqual(encryptTokens(key, aad, { x: 1 }), encryptTokens(key, aad, { x: 1 }));
});

test("encryption refuses a key that is not 32 bytes", () => {
  assert.throws(() => encryptTokens(Buffer.from("short").toString("base64"), "a", {}));
});

function env(overrides = {}) {
  return {
    SQUARE_ENVIRONMENT: "sandbox",
    SQUARE_APPLICATION_ID: "sandbox-sq0idb-test",
    SQUARE_APPLICATION_SECRET: "test-secret",
    SQUARE_TOKEN_ENCRYPTION_KEY: key,
    SQUARE_REDIRECT_URI: "http://localhost:4327/admin/",
    SQUARE_WEBHOOK_SIGNATURE_KEY: "sig",
    SQUARE_WEBHOOK_URL: "https://api.example.test/v1/square/webhook",
    ...overrides
  };
}

test("config is complete for sandbox and points at the sandbox host", () => {
  const cfg = squareConfig(env(), { production: false });
  assert.deepEqual(squareConfigProblems(cfg), []);
  assert.equal(cfg.apiBase, "https://connect.squareupsandbox.com");
});

test("config reports every missing setting by name", () => {
  const cfg = squareConfig({}, { production: false });
  const problems = squareConfigProblems(cfg).join(" ");
  for (const name of [
    "SQUARE_ENVIRONMENT",
    "SQUARE_APPLICATION_ID",
    "SQUARE_APPLICATION_SECRET",
    "SQUARE_TOKEN_ENCRYPTION_KEY",
    "SQUARE_REDIRECT_URI",
    "SQUARE_WEBHOOK_SIGNATURE_KEY",
    "SQUARE_WEBHOOK_URL"
  ]) {
    assert.ok(problems.includes(name), `${name} should be reported`);
  }
});

test("the live server refuses sandbox Square and plain-http URLs", () => {
  const cfg = squareConfig(env(), { production: true });
  assert.ok(squareConfigProblems(cfg).some((p) => p.includes("SQUARE_ENVIRONMENT")));
  const prod = squareConfig(
    env({
      SQUARE_ENVIRONMENT: "production",
      SQUARE_APPLICATION_ID: "sq0idp-live",
      SQUARE_REDIRECT_URI: "http://theskinden.co.uk/admin/"
    }),
    { production: true }
  );
  assert.ok(squareConfigProblems(prod).some((p) => p.includes("SQUARE_REDIRECT_URI")));
});

test("a malformed encryption key is reported, not used", () => {
  const cfg = squareConfig(env({ SQUARE_TOKEN_ENCRYPTION_KEY: "abc" }), { production: false });
  assert.ok(squareConfigProblems(cfg).some((p) => p.includes("SQUARE_TOKEN_ENCRYPTION_KEY")));
});
