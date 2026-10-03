import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { resolve } from "./resolve-ts.mjs";

// Same TS type-stripping hook the other unit tests use.
registerHooks({ resolve });

const { summarizeBilling } = await import("../web/src/lib/entitlements/billing-summary.ts");
const { resolveEntitlement } = await import("../web/src/lib/entitlements/policy.ts");

const NOW = new Date("2026-03-01T00:00:00Z");

/** A subscriptions row with sensible defaults; override per test. */
function row(overrides = {}) {
  return {
    user_id: "u1",
    plan: "free",
    status: "expired",
    trial_ends_at: null,
    current_period_end: null,
    cancel_at_period_end: false,
    provider: null,
    provider_customer_id: null,
    provider_subscription_id: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

/** Summarize a row through the real resolver, so row + entitlement agree. */
function summarize(r, now = NOW) {
  return summarizeBilling(r, resolveEntitlement(r, now), now);
}

test("no subscriptions row summarizes to the Free floor", () => {
  const s = summarizeBilling(null, resolveEntitlement(null, NOW), NOW);
  assert.equal(s.state, "free");
  assert.equal(s.planLabel, "Free");
  assert.equal(s.manageBilling.available, false);
  assert.deepEqual(s.nextAction, { label: "See Pro", href: "/pricing" });
});

test("an active reverse trial counts down and offers an upgrade", () => {
  const s = summarize(
    row({ plan: "trial", status: "trialing", trial_ends_at: "2026-03-05T00:00:00Z" }),
  );
  assert.equal(s.state, "trial");
  assert.equal(s.planLabel, "Pro trial");
  assert.match(s.detail, /4 days left/);
  assert.equal(s.renewalDate, "2026-03-05T00:00:00Z");
  assert.equal(s.nextAction.label, "Upgrade to Pro");
});

test("a trial in its last day is surfaced as ending soon", () => {
  const s = summarize(
    row({ plan: "trial", status: "trialing", trial_ends_at: "2026-03-02T00:00:00Z" }),
  );
  assert.equal(s.state, "trial_ending");
  assert.match(s.detail, /ends today|1 days left/i);
});

test("an active paid subscription shows the renewal date and manages billing", () => {
  const s = summarize(
    row({
      plan: "pro",
      status: "active",
      provider: "paddle",
      provider_customer_id: "ctm_1",
      provider_subscription_id: "sub_1",
      current_period_end: "2026-04-01T00:00:00Z",
    }),
  );
  assert.equal(s.state, "active");
  assert.equal(s.planLabel, "Forge Pro");
  assert.equal(s.renewalDate, "2026-04-01T00:00:00Z");
  assert.equal(s.manageBilling.available, true);
  assert.equal(s.manageBilling.provider, "paddle");
  assert.equal(s.nextAction, null); // nothing to push
});

test("a scheduled cancellation keeps Pro but invites a resume", () => {
  const s = summarize(
    row({
      plan: "pro",
      status: "active",
      cancel_at_period_end: true,
      provider: "paddle",
      provider_subscription_id: "sub_1",
      current_period_end: "2026-04-01T00:00:00Z",
    }),
  );
  assert.equal(s.state, "cancelling");
  assert.equal(s.nextAction.label, "Resume Pro");
  assert.match(s.detail, /keep Pro until/i);
});

test("past_due prompts a payment-method update and keeps Pro in grace", () => {
  const s = summarize(
    row({
      plan: "pro",
      status: "past_due",
      provider: "paddle",
      provider_subscription_id: "sub_1",
      current_period_end: "2026-03-10T00:00:00Z",
    }),
  );
  assert.equal(s.state, "past_due");
  assert.equal(s.nextAction.label, "Update payment method");
  assert.equal(s.manageBilling.available, true);
});

test("a one-time lifetime purchase reads as perpetual, with nothing to manage", () => {
  const s = summarize(
    row({ plan: "pro", status: "active", provider: "paddle", current_period_end: null }),
  );
  assert.equal(s.state, "lifetime");
  assert.equal(s.planLabel, "Forge Lifetime");
  assert.equal(s.nextAction, null);
  assert.equal(s.manageBilling.available, false);
  assert.equal(s.renewalDate, null);
});

test("a lapsed/expired paid row falls back to the Free floor with progress intact", () => {
  const s = summarize(
    row({
      plan: "pro",
      status: "expired",
      provider: "paddle",
      provider_subscription_id: "sub_1",
      current_period_end: "2026-02-01T00:00:00Z", // in the past
    }),
  );
  assert.equal(s.state, "free");
  assert.match(s.detail, /progress and streak are intact/i);
});
