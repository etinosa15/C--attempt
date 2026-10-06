import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { resolve } from "./resolve-ts.mjs";

// Same TS type-stripping hook the other unit tests use.
registerHooks({ resolve });

const { computeXp, levelThreshold, levelForXp, computeBadges, summarizeGamification, XP, xpBreakdown, sortBadgesForDisplay } =
  await import("../web/src/lib/progress/gamification.ts");

test("computeXp sums every source with its weight", () => {
  assert.equal(computeXp({}), 0);
  assert.equal(
    computeXp({
      completed: ["js-a", "js-b"], // 2 * 40
      solved: ["js-a"], // 1 * 30
      quizzes: { "js-a": true, "js-b": false }, // 1 passed * 15
      reviews: { "js-a": { count: 2 }, "js-b": { count: 0 } }, // 1 kept * 8
      certificates: { js: 123 }, // 1 * 200
    }),
    2 * XP.lesson + XP.challenge + XP.quiz + XP.review + XP.certificate,
  );
});

test("xpBreakdown splits XP by source and its total equals computeXp", () => {
  const p = {
    completed: ["js-a", "js-b", "cs-a"],
    solved: ["js-a"],
    quizzes: { "js-a": true },
    reviews: { "js-a": { count: 3 } },
    certificates: {},
  };
  const b = xpBreakdown(p);
  assert.equal(b.lessons, 3 * XP.lesson);
  assert.equal(b.challenges, 1 * XP.challenge);
  assert.equal(b.quizzes, 1 * XP.quiz);
  assert.equal(b.reviews, 1 * XP.review);
  assert.equal(b.certificates, 0);
  assert.equal(b.total, computeXp(p));
});

test("levelThreshold is triangular (100 more each level)", () => {
  assert.equal(levelThreshold(1), 0);
  assert.equal(levelThreshold(2), 100);
  assert.equal(levelThreshold(3), 300);
  assert.equal(levelThreshold(4), 600);
  assert.equal(levelThreshold(5), 1000);
});

test("levelForXp places XP in the right level with progress", () => {
  assert.equal(levelForXp(0).level, 1);
  assert.equal(levelForXp(99).level, 1);
  assert.equal(levelForXp(100).level, 2);
  assert.equal(levelForXp(299).level, 2);
  assert.equal(levelForXp(300).level, 3);
  assert.equal(levelForXp(1000).level, 5);
  // Halfway from L2 (100) to L3 (300) is 200.
  const mid = levelForXp(200);
  assert.equal(mid.level, 2);
  assert.equal(mid.xpIntoLevel, 100);
  assert.equal(mid.xpForLevel, 200);
  assert.equal(mid.progress, 0.5);
  assert.equal(mid.title, "Apprentice");
  assert.equal(mid.xpToNext, 100); // 200 into [100,300) -> 100 to reach L3
});

test("levelForXp clamps the title at the top and floors negative/fractional xp", () => {
  assert.equal(levelForXp(-50).level, 1);
  assert.equal(levelForXp(1_000_000).title, "Legend"); // capped, not out of range
});

test("computeBadges reflects thresholds and bilingual detection", () => {
  const none = computeBadges({}, 0);
  assert.ok(none.every((b) => !b.earned));

  const some = computeBadges(
    { completed: ["js-intro", "cs-intro"], certificates: { js: 1 } },
    7,
  );
  const earned = new Set(some.filter((b) => b.earned).map((b) => b.id));
  assert.ok(earned.has("first-lesson"));
  assert.ok(earned.has("bilingual")); // both js- and cs- present
  assert.ok(earned.has("graduate")); // a certificate
  assert.ok(earned.has("streak-3"));
  assert.ok(earned.has("streak-7"));
  assert.ok(!earned.has("streak-30")); // 7 < 30
  assert.ok(!earned.has("ten-lessons")); // only 2
});

test("bilingual needs BOTH languages, not two of one", () => {
  const jsOnly = computeBadges({ completed: ["js-a", "js-b"] }, 0);
  assert.equal(jsOnly.find((b) => b.id === "bilingual").earned, false);
});

test("badges expose progress toward locked targets; one-shot badges have no label", () => {
  const bs = computeBadges({ completed: Array.from({ length: 7 }, (_, i) => `js-${i}`) }, 0);
  const ten = bs.find((b) => b.id === "ten-lessons");
  assert.equal(ten.earned, false);
  assert.equal(ten.current, 7);
  assert.equal(ten.target, 10);
  assert.equal(ten.progress, 0.7);
  assert.equal(ten.progressLabel, "7 / 10 lessons");
  // One-shot badge: earned, and no "0 / 1" clutter.
  const first = bs.find((b) => b.id === "first-lesson");
  assert.equal(first.earned, true);
  assert.equal(first.progressLabel, "");
  // Progress is capped at 1 even when the count exceeds the target.
  const streaky = computeBadges({}, 50).find((b) => b.id === "streak-30");
  assert.equal(streaky.progress, 1);
  assert.equal(streaky.earned, true);
});

test("sortBadgesForDisplay puts earned first, then locked closest-to-earning first", () => {
  // 5 lessons, 9 solved: first-lesson earned; ten-lessons 0.5; challenger 0.9.
  const bs = computeBadges(
    { completed: Array.from({ length: 5 }, (_, i) => `js-${i}`), solved: Array.from({ length: 9 }, (_, i) => `c-${i}`) },
    0,
  );
  const sorted = sortBadgesForDisplay(bs);
  // All earned come before all locked.
  const firstLockedIdx = sorted.findIndex((b) => !b.earned);
  assert.ok(sorted.slice(0, firstLockedIdx).every((b) => b.earned));
  assert.ok(sorted.slice(firstLockedIdx).every((b) => !b.earned));
  // Among locked, challenger (0.9) ranks above ten-lessons (0.5).
  const locked = sorted.filter((b) => !b.earned).map((b) => b.id);
  assert.ok(locked.indexOf("challenger") < locked.indexOf("ten-lessons"));
});

test("summarizeGamification bundles xp, level and badge counts", () => {
  const s = summarizeGamification({ completed: ["js-a"] }, 3);
  assert.equal(s.xp, XP.lesson);
  assert.equal(s.level.level, 1);
  assert.equal(s.totalBadges, s.badges.length);
  assert.equal(
    s.earnedCount,
    s.badges.filter((b) => b.earned).length,
  );
  // first-lesson + streak-3 earned at minimum.
  assert.ok(s.earnedCount >= 2);
});
