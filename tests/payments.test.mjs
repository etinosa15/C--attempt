import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { registerHooks } from "node:module";
import { resolve } from "./resolve-ts.mjs";

// Same TS type-stripping hook the other unit tests use.
registerHooks({ resolve });

const { resolveSelection } = await import("../web/src/lib/payments/catalog.ts");
const { verifyPaddleSignature, subscriptionUpsertFromEvent } = await import(
  "../web/src/lib/payments/paddle.ts"
);

// --- catalog: only sellable combinations resolve --------------------------
test("resolveSelection maps plans to their price env + kind", () => {
  assert.equal(resolveSelection("pro", "monthly").entry.priceEnv, "PADDLE_PRICE_PRO_MONTHLY");
  assert.equal(resolveSelection("pro", "annual").entry.priceEnv, "PADDLE_PRICE_PRO_ANNUAL");
  // Pro defaults to annual (the pricing page default) when billing is absent/odd.
  assert.equal(resolveSelection("pro", undefined).selection.billing, "annual");
  assert.equal(resolveSelection("pro", "bogus").selection.billing, "annual");
  const life = resolveSelection("lifetime", undefined);
  assert.equal(life.entry.kind, "one_time");
  assert.equal(life.selection.plan, "lifetime");
  assert.equal(resolveSelection("teams", undefined), null);
  assert.equal(resolveSelection(undefined, undefined), null);
});

// --- signature verification (the security-critical part) ------------------
const SECRET = "pdl_ntfset_test_secret";
function sign(rawBody, ts, secret = SECRET) {
  const h1 = crypto.createHmac("sha256", secret).update(`${ts}:${rawBody}`).digest("hex");
  return `ts=${ts};h1=${h1}`;
}

test("verifyPaddleSignature accepts a fresh, correctly-signed body", () => {
  const now = new Date("2026-02-01T00:00:00Z");
  const ts = Math.floor(now.getTime() / 1000);
  const body = JSON.stringify({ event_type: "subscription.updated" });
  assert.equal(verifyPaddleSignature(body, sign(body, ts), SECRET, now), true);
});

test("verifyPaddleSignature rejects a wrong secret, tampered body, or missing header", () => {
  const now = new Date("2026-02-01T00:00:00Z");
  const ts = Math.floor(now.getTime() / 1000);
  const body = JSON.stringify({ a: 1 });
  assert.equal(verifyPaddleSignature(body, sign(body, ts, "wrong"), SECRET, now), false);
  assert.equal(verifyPaddleSignature(body + "x", sign(body, ts), SECRET, now), false);
  assert.equal(verifyPaddleSignature(body, null, SECRET, now), false);
  assert.equal(verifyPaddleSignature(body, "garbage", SECRET, now), false);
});

test("verifyPaddleSignature rejects stale timestamps (replay window)", () => {
  const now = new Date("2026-02-01T00:00:00Z");
  const staleTs = Math.floor(now.getTime() / 1000) - 60 * 60; // an hour old
  const body = JSON.stringify({ a: 1 });
  assert.equal(verifyPaddleSignature(body, sign(body, staleTs), SECRET, now), false);
});

test("verifyPaddleSignature honors multiple h1 values (secret rotation)", () => {
  const now = new Date("2026-02-01T00:00:00Z");
  const ts = Math.floor(now.getTime() / 1000);
  const body = JSON.stringify({ a: 1 });
  const good = crypto.createHmac("sha256", SECRET).update(`${ts}:${body}`).digest("hex");
  const header = `ts=${ts};h1=deadbeef;h1=${good}`;
  assert.equal(verifyPaddleSignature(body, header, SECRET, now), true);
});

// --- event -> subscriptions row mapping -----------------------------------
test("a subscription event maps to a paid Pro row keyed by custom_data.user_id", () => {
  const up = subscriptionUpsertFromEvent({
    event_type: "subscription.activated",
    data: {
      id: "sub_123",
      status: "active",
      customer_id: "ctm_1",
      custom_data: { user_id: "user-abc" },
      current_billing_period: { ends_at: "2026-03-01T00:00:00Z" },
    },
  });
  assert.deepEqual(up, {
    user_id: "user-abc",
    provider: "paddle",
    provider_customer_id: "ctm_1",
    plan: "pro",
    status: "active",
    current_period_end: "2026-03-01T00:00:00Z",
    cancel_at_period_end: false,
    provider_subscription_id: "sub_123",
  });
});

test("a scheduled cancel sets cancel_at_period_end", () => {
  const up = subscriptionUpsertFromEvent({
    event_type: "subscription.updated",
    data: {
      id: "sub_123",
      status: "active",
      custom_data: { user_id: "u1" },
      scheduled_change: { action: "cancel" },
    },
  });
  assert.equal(up.cancel_at_period_end, true);
});

test("an unexpected/paused status resolves to expired (loses access)", () => {
  const up = subscriptionUpsertFromEvent({
    event_type: "subscription.updated",
    data: { id: "s", status: "paused", custom_data: { user_id: "u1" } },
  });
  assert.equal(up.status, "expired");
});

test("a one-time transaction (Lifetime) grants perpetual Pro with no period end", () => {
  const up = subscriptionUpsertFromEvent({
    event_type: "transaction.completed",
    data: { id: "txn_1", customer_id: "ctm_9", subscription_id: null, custom_data: { user_id: "u2" } },
  });
  assert.equal(up.plan, "pro");
  assert.equal(up.status, "active");
  assert.equal(up.current_period_end, null);
  assert.equal(up.provider_subscription_id, null);
});

test("a subscription renewal transaction is ignored (handled by subscription.*)", () => {
  const up = subscriptionUpsertFromEvent({
    event_type: "transaction.completed",
    data: { id: "txn_2", subscription_id: "sub_123", custom_data: { user_id: "u2" } },
  });
  assert.equal(up, null);
});

test("events without a user_id, or of unknown type, are not acted on", () => {
  assert.equal(
    subscriptionUpsertFromEvent({ event_type: "subscription.updated", data: { id: "s", status: "active" } }),
    null,
  );
  assert.equal(
    subscriptionUpsertFromEvent({ event_type: "address.created", data: { custom_data: { user_id: "u" } } }),
    null,
  );
});
