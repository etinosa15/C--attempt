import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { resolve } from "./resolve-ts.mjs";

// Same TS type-stripping hook the other unit tests use.
registerHooks({ resolve });

const { streakWithShield, STREAK_SHIELD_DAYS } = await import(
  "../web/src/lib/progress/streak-shield.ts"
);

// Build an activity map from day-offsets (0 = today, 1 = yesterday, …).
const TODAY = new Date("2026-03-15T12:00:00");
function activityFor(offsets) {
  const a = {};
  for (const off of offsets) {
    const d = new Date(TODAY);
    d.setDate(d.getDate() - off);
    a[`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`] = true;
  }
  return a;
}

test("budget 0 matches the base streak: consecutive active days, breaks on a gap", () => {
  // Active today, yesterday, 2 days ago; gap at 3.
  assert.equal(streakWithShield(activityFor([0, 1, 2]), 0, TODAY), 3);
  // Missing today but active yesterday & before — today's blank is free.
  assert.equal(streakWithShield(activityFor([1, 2, 3]), 0, TODAY), 3);
  // A gap at day 1 breaks it immediately (only today counts).
  assert.equal(streakWithShield(activityFor([0, 2, 3]), 0, TODAY), 1);
  // No activity at all.
  assert.equal(streakWithShield({}, 0, TODAY), 0);
});

test("a shield bridges a single missed day a Free streak would lose", () => {
  // Active today & 2-days-ago; yesterday missed. Base would stop at 1; shield bridges.
  const a = activityFor([0, 2, 3]);
  assert.equal(streakWithShield(a, 0, TODAY), 1); // Free
  assert.equal(streakWithShield(a, 1, TODAY), 3); // Pro: bridges day 1, counts 0,2,3
});

test("the budget is a total cap, not a per-gap allowance", () => {
  // Every-other-day activity: 0,2,4,6… With budget 2, two gaps are forgiven then it stops.
  const everyOther = activityFor([0, 2, 4, 6, 8]);
  // counts day0 (n1), bridge1 (gap@1), day2 (n2), bridge2 (gap@3), day4 (n3),
  // gap@5 -> budget spent -> stop.
  assert.equal(streakWithShield(everyOther, 2, TODAY), 3);
});

test("shields are only spent where they extend the run (trailing gap ends it)", () => {
  // Active only today; everything before missing. Budget can't manufacture a streak.
  assert.equal(streakWithShield(activityFor([0]), 2, TODAY), 1);
});

test("STREAK_SHIELD_DAYS is the configured Pro budget", () => {
  assert.equal(typeof STREAK_SHIELD_DAYS, "number");
  assert.ok(STREAK_SHIELD_DAYS >= 1);
});
