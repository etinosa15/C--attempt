import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { registerHooks } from "node:module";
import { resolve } from "./resolve-ts.mjs";

// Same TS type-stripping hook the other unit tests use.
registerHooks({ resolve });

const { verifyPaystackSignature, subscriptionWriteFromEvent } = await import(
  "../web/src/lib/payments/paystack.ts"
);
const { targetFor } = await import("../web/src/lib/payments/paystack-catalog.ts");

const SECRET = "sk_test_abc123";
const sign = (body) => crypto.createHmac("sha512", SECRET).update(body).digest("hex");

// --- signature verification -------------------------------------------------
test("verifyPaystackSignature accepts a correct HMAC-SHA512 and rejects everything else", () => {
  const body = JSON.stringify({ event: "charge.success", data: { status: "success" } });
  assert.equal(verifyPaystackSignature(body, sign(body), SECRET), true);
  // Wrong secret, tampered body, missing/garbage header, wrong secret param.
  assert.equal(verifyPaystackSignature(body, sign(body), "sk_test_other"), false);
  assert.equal(verifyPaystackSignature(body + " ", sign(body), SECRET), false);
  assert.equal(verifyPaystackSignature(body, null, SECRET), false);
  assert.equal(verifyPaystackSignature(body, "not-hex-zz", SECRET), false);
  assert.equal(verifyPaystackSignature(body, sign(body), ""), false);
});

// --- catalog target ---------------------------------------------------------
test("targetFor maps selections to the right Paystack target env", () => {
  assert.deepEqual(targetFor({ plan: "pro", billing: "monthly" }), {
    kind: "plan",
    planCodeEnv: "PAYSTACK_PLAN_PRO_MONTHLY",
  });
  assert.deepEqual(targetFor({ plan: "pro", billing: "annual" }), {
    kind: "plan",
    planCodeEnv: "PAYSTACK_PLAN_PRO_ANNUAL",
  });
  // Pro defaults to annual when billing is absent; lifetime is a one-time amount.
  assert.equal(targetFor({ plan: "pro" }).planCodeEnv, "PAYSTACK_PLAN_PRO_ANNUAL");
  assert.deepEqual(targetFor({ plan: "lifetime" }), {
    kind: "amount",
    amountEnv: "PAYSTACK_AMOUNT_LIFETIME",
  });
});

// --- event mapping ----------------------------------------------------------
test("charge.success for a one-time Lifetime grants perpetual Pro, keyed by user", () => {
  const w = subscriptionWriteFromEvent({
    event: "charge.success",
    data: {
      status: "success",
      metadata: { user_id: "u1" },
      customer: { customer_code: "CUS_1" },
      // no plan -> one-time
    },
  });
  assert.equal(w.by, "user");
  assert.equal(w.userId, "u1");
  assert.equal(w.plan, "pro");
  assert.equal(w.status, "active");
  assert.equal(w.current_period_end, null); // lifetime never lapses
  assert.equal(w.provider_subscription_id, null);
  assert.equal(w.provider_customer_id, "CUS_1");
});

test("charge.success for a subscription carries the plan + sub code", () => {
  const w = subscriptionWriteFromEvent({
    event: "charge.success",
    data: {
      status: "success",
      metadata: { user_id: "u2" },
      customer: { customer_code: "CUS_2" },
      plan: { plan_code: "PLN_pro_monthly" },
      subscription_code: "SUB_2",
      next_payment_date: "2026-04-01T00:00:00Z",
    },
  });
  assert.equal(w.by, "user");
  assert.equal(w.status, "active");
  assert.equal(w.current_period_end, "2026-04-01T00:00:00Z");
  assert.equal(w.provider_subscription_id, "SUB_2");
});

test("charge.success without a user_id can't be attributed -> null", () => {
  assert.equal(
    subscriptionWriteFromEvent({ event: "charge.success", data: { status: "success" } }),
    null,
  );
});

test("subscription lifecycle events are keyed by customer code", () => {
  const create = subscriptionWriteFromEvent({
    event: "subscription.create",
    data: {
      customer: { customer_code: "CUS_3" },
      subscription_code: "SUB_3",
      next_payment_date: "2026-04-01T00:00:00Z",
    },
  });
  assert.equal(create.by, "customer");
  assert.equal(create.customerCode, "CUS_3");
  assert.equal(create.status, "active");
  assert.equal(create.cancel_at_period_end, false);

  // not_renew: auto-renew off, still Pro until period end.
  const notRenew = subscriptionWriteFromEvent({
    event: "subscription.not_renew",
    data: { customer: { customer_code: "CUS_3" }, next_payment_date: "2026-04-01T00:00:00Z" },
  });
  assert.equal(notRenew.status, "active");
  assert.equal(notRenew.cancel_at_period_end, true);

  // disable: the subscription actually ended -> canceled (resolver drops to Free).
  const disable = subscriptionWriteFromEvent({
    event: "subscription.disable",
    data: { customer: { customer_code: "CUS_3" } },
  });
  assert.equal(disable.status, "canceled");
});

test("renewal invoices map to dunning / re-activation", () => {
  const failed = subscriptionWriteFromEvent({
    event: "invoice.payment_failed",
    data: {
      customer: { customer_code: "CUS_4" },
      subscription: { subscription_code: "SUB_4", next_payment_date: "2026-05-01T00:00:00Z" },
    },
  });
  assert.equal(failed.by, "customer");
  assert.equal(failed.status, "past_due"); // grace in the resolver
  assert.equal(failed.provider_subscription_id, "SUB_4");

  const paid = subscriptionWriteFromEvent({
    event: "invoice.update",
    data: {
      status: "success",
      customer: { customer_code: "CUS_4" },
      subscription: { subscription_code: "SUB_4", next_payment_date: "2026-06-01T00:00:00Z" },
    },
  });
  assert.equal(paid.status, "active");
  assert.equal(paid.current_period_end, "2026-06-01T00:00:00Z");

  // A non-success invoice.update isn't acted on.
  assert.equal(
    subscriptionWriteFromEvent({
      event: "invoice.update",
      data: { status: "pending", customer: { customer_code: "CUS_4" } },
    }),
    null,
  );
});

test("events we don't handle map to null", () => {
  assert.equal(subscriptionWriteFromEvent({ event: "customeridentification.success", data: {} }), null);
  assert.equal(subscriptionWriteFromEvent({ data: {} }), null);
  assert.equal(subscriptionWriteFromEvent({ event: "charge.success" }), null);
});
