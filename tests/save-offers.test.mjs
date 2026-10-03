import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { resolve } from "./resolve-ts.mjs";

// Same TS type-stripping hook the other unit tests use.
registerHooks({ resolve });

const { planSaveOffers } = await import("../web/src/lib/entitlements/save-offers.ts");

const NOW = new Date("2026-03-01T00:00:00Z");

/** A subscriptions row with sensible defaults; override per test. */
function row(overrides = {}) {
  return {
    user_id: "u1",
    plan: "pro",
    status: "active",
    trial_ends_at: null,
    current_period_end: "2026-04-01T00:00:00Z",
    cancel_at_period_end: false,
    provider: "paddle",
    provider_customer_id: "ctm_1",
    provider_subscription_id: "sub_1",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

test("no row, no subscription, or non-pro has nothing to save", () => {
  assert.deepEqual(planSaveOffers(null, { pauseSupported: true }, NOW), []);
  assert.deepEqual(
    planSaveOffers(row({ provider_subscription_id: null }), { pauseSupported: true }, NOW),
    [],
  );
  assert.deepEqual(planSaveOffers(row({ plan: "free" }), { pauseSupported: true }, NOW), []);
});

test("the honest downgrade is always the last offer, even with no save config", () => {
  const offers = planSaveOffers(row(), {}, NOW);
  assert.equal(offers.length, 1);
  assert.equal(offers[0].id, "downgrade");
});

test("pause and discount are offered only when the environment can honor them", () => {
  const offers = planSaveOffers(
    row(),
    { pauseSupported: true, retentionDiscountId: "dsc_ret" },
    NOW,
  );
  // Ordered least-lossy first: pause, discount, then the downgrade.
  assert.deepEqual(
    offers.map((o) => o.id),
    ["pause", "discount", "downgrade"],
  );
});

test("a configured discount but no pause support drops pause but keeps the rest", () => {
  const offers = planSaveOffers(row(), { retentionDiscountId: "dsc_ret" }, NOW);
  assert.deepEqual(
    offers.map((o) => o.id),
    ["discount", "downgrade"],
  );
});

test("downgrade copy acknowledges longer tenure (certificates kept)", () => {
  const newish = planSaveOffers(row({ created_at: "2026-02-20T00:00:00Z" }), {}, NOW);
  const seasoned = planSaveOffers(row({ created_at: "2025-06-01T00:00:00Z" }), {}, NOW);
  assert.doesNotMatch(newish[0].detail, /certificates/i);
  assert.match(seasoned[0].detail, /certificates/i);
});
