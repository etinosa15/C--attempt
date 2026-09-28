import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { resolve } from "./resolve-ts.mjs";

// The resolver is TypeScript with extensionless imports; this hook lets Node's
// native type-stripping load it (see resolve-ts.mjs).
registerHooks({ resolve });
const { resolveEntitlement, TRIAL_DAYS, PRO_FEATURES, FREE_FEATURES } = await import(
  "../web/src/lib/entitlements/policy.ts"
);

const NOW = new Date("2026-06-01T12:00:00.000Z");
const iso = (deltaDays) => new Date(NOW.getTime() + deltaDays * 24 * 60 * 60 * 1000).toISOString();

// A subscription row with sensible defaults, overridable per case.
function row(overrides = {}) {
  return {
    user_id: "u1",
    plan: "trial",
    status: "trialing",
    trial_ends_at: null,
    current_period_end: null,
    cancel_at_period_end: false,
    provider: null,
    provider_customer_id: null,
    provider_subscription_id: null,
    created_at: iso(-1),
    updated_at: iso(-1),
    ...overrides,
  };
}

test("missing row resolves to the free floor (never grant Pro without a row)", () => {
  for (const missing of [null, undefined]) {
    const e = resolveEntitlement(missing, NOW);
    assert.equal(e.tier, "free");
    assert.equal(e.inTrial, false);
    assert.equal(e.trialEndsAt, null);
    assert.equal(e.trialDaysLeft, null);
    assert.deepEqual(e.features, FREE_FEATURES);
  }
});

test("active reverse trial grants Pro and reports whole days left", () => {
  const e = resolveEntitlement(row({ status: "trialing", trial_ends_at: iso(TRIAL_DAYS) }), NOW);
  assert.equal(e.tier, "pro");
  assert.equal(e.inTrial, true);
  assert.equal(e.trialDaysLeft, TRIAL_DAYS);
  assert.deepEqual(e.features, PRO_FEATURES);
});

test("trial with a fractional remainder rounds up the days left", () => {
  // 2.5 days left should read as 3, not 2 — never undersell remaining trial time.
  const e = resolveEntitlement(row({ status: "trialing", trial_ends_at: iso(2.5) }), NOW);
  assert.equal(e.inTrial, true);
  assert.equal(e.trialDaysLeft, 3);
});

test("lapsed trial downshifts to the free floor", () => {
  const e = resolveEntitlement(row({ status: "trialing", trial_ends_at: iso(-1) }), NOW);
  assert.equal(e.tier, "free");
  assert.equal(e.inTrial, false);
  assert.equal(e.trialDaysLeft, null);
});

test("trialing with no trial_ends_at is treated as lapsed (free)", () => {
  const e = resolveEntitlement(row({ status: "trialing", trial_ends_at: null }), NOW);
  assert.equal(e.tier, "free");
});

test("active paid subscription within its period is Pro and not in trial", () => {
  const e = resolveEntitlement(
    row({ plan: "pro", status: "active", trial_ends_at: null, current_period_end: iso(20) }),
    NOW,
  );
  assert.equal(e.tier, "pro");
  assert.equal(e.inTrial, false);
  assert.equal(e.trialEndsAt, null);
});

test("active subscription past its period end defensively drops to free", () => {
  const e = resolveEntitlement(
    row({ plan: "pro", status: "active", current_period_end: iso(-1) }),
    NOW,
  );
  assert.equal(e.tier, "free");
});

test("past_due keeps Pro during the dunning grace period", () => {
  const e = resolveEntitlement(
    row({ plan: "pro", status: "past_due", current_period_end: iso(3) }),
    NOW,
  );
  assert.equal(e.tier, "pro");
});

test("canceled and expired both resolve to free", () => {
  for (const status of ["canceled", "expired"]) {
    assert.equal(resolveEntitlement(row({ status }), NOW).tier, "free");
  }
});

test("free features reserve the paid headline value but keep retention hooks", () => {
  // The free/paid line: no C#, tutor, certificates or full curriculum; but the
  // review habit and cross-device sync stay, so free users are retained.
  assert.equal(FREE_FEATURES.runCsharp, false);
  assert.equal(FREE_FEATURES.aiTutor, false);
  assert.equal(FREE_FEATURES.certificates, false);
  assert.equal(FREE_FEATURES.unlimitedLessons, false);
  assert.equal(FREE_FEATURES.spacedReview, true);
  assert.equal(FREE_FEATURES.crossDeviceSync, true);
  // Pro unlocks everything.
  assert.ok(Object.values(PRO_FEATURES).every(Boolean));
});
