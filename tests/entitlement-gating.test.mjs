import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { resolve } from "./resolve-ts.mjs";

// Same TS type-stripping hook the entitlement resolver tests use.
registerHooks({ resolve });
const { FREE_FEATURES, PRO_FEATURES } = await import(
  "../web/src/lib/entitlements/policy.ts"
);
const {
  FREE_MODULE_COUNT,
  isFreeLesson,
  canPractice,
  isLessonLocked,
  canEarnCertificate,
  canRunCsharp,
} = await import("../web/src/lib/entitlements/gating.ts");

// Minimal entitlement stand-ins — the gating layer only reads `features`.
const pro = { tier: "pro", inTrial: false, trialEndsAt: null, trialDaysLeft: null, features: PRO_FEATURES };
const free = { tier: "free", inTrial: false, trialEndsAt: null, trialDaysLeft: null, features: FREE_FEATURES };
const lesson = (module) => ({ module });

test("the free floor is exactly the first FREE_MODULE_COUNT modules", () => {
  assert.equal(FREE_MODULE_COUNT, 1);
  assert.equal(isFreeLesson(lesson(0)), true);
  assert.equal(isFreeLesson(lesson(FREE_MODULE_COUNT)), false);
  assert.equal(isFreeLesson(lesson(4)), false);
});

test("free-floor lessons are practisable for everyone, including signed-out", () => {
  for (const ent of [pro, free, null, undefined]) {
    assert.equal(canPractice(ent, lesson(0)), true);
    assert.equal(isLessonLocked(ent, lesson(0)), false);
  }
});

test("paid lessons need the unlimitedLessons capability", () => {
  assert.equal(canPractice(pro, lesson(2)), true);
  assert.equal(canPractice(free, lesson(2)), false);
  assert.equal(canPractice(null, lesson(2)), false); // signed-out → Free floor
  assert.equal(isLessonLocked(free, lesson(2)), true);
  assert.equal(isLessonLocked(pro, lesson(2)), false);
});

test("certificates and the C# runner are Pro capabilities", () => {
  assert.equal(canEarnCertificate(pro), true);
  assert.equal(canEarnCertificate(free), false);
  assert.equal(canEarnCertificate(null), false);
  assert.equal(canRunCsharp(pro), true);
  assert.equal(canRunCsharp(free), false);
});
