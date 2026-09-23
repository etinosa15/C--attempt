import test from "node:test";
import assert from "node:assert/strict";
import {
  freshState,
  sanitizeState,
  validateProgress,
  dayKey,
  streak,
  scheduleReview,
  escapeHtml,
  highlight,
  hintTiers,
  rubricScore,
  resolveTheme,
} from "../public/core.js";
import { lessons, projects } from "../public/curriculum.js";
test("curriculum IDs are unique and challenges include edge cases", () => {
  assert.equal(lessons.length, 40);
  assert.equal(new Set(lessons.map((l) => l.id)).size, 40);
  for (const l of lessons) {
    assert.ok(l.sections.length >= 3);
    assert.ok(l.challenge.tests.length >= 3);
    assert.ok(l.quiz.answer >= 0 && l.quiz.answer < l.quiz.choices.length);
    assert.ok(l.challenge.solution);
  }
  assert.equal(projects.length, 6);
});
test("saved progress rejects bad shapes and preserves valid work", () => {
  const state = freshState();
  state.completed = ["js-values", "js-values"];
  state.notes = { "js-values": "my note" };
  state.reviews = { good: { due: 123, interval: 1, count: 2 }, bad: "invalid" };
  state.activity = { "2026-09-12": 2, wrong: "x" };
  state.projectChecks = { habit: [0, 0, 1, 99], bad: "bad" };
  const normalized = sanitizeState(state);
  assert.deepEqual(normalized.completed, ["js-values"]);
  assert.equal(normalized.notes["js-values"], "my note");
  assert.deepEqual(normalized.projectChecks.habit, [0, 1]);
  assert.equal(normalized.reviews.bad, undefined);
  assert.equal(normalized.activity.wrong, undefined);
  assert.throws(() => sanitizeState({ version: 9 }));
});
test("backup validation rejects incomplete collections before restore", () => {
  for (const raw of [null, [], { version: 1 }, { ...freshState(), notes: [] },
    { ...freshState(), completed: null }, { ...freshState(), projectChecks: "bad" }])
    assert.throws(() => validateProgress(raw), /incomplete or damaged/);
  const legacy = freshState();
  delete legacy.focusByDay;
  delete legacy.focusTimer;
  legacy.notes.scratchpad = "Keep my work";
  const restored = validateProgress(legacy);
  assert.equal(restored.notes.scratchpad, "Keep my work");
  assert.deepEqual(restored.focusByDay, {});
  assert.equal(restored.focusTimer.accountedAt, null);
  assert.deepEqual(validateProgress(freshState()), freshState());
});
test("first-visit and backup-reminder fields default safely and survive a round trip", () => {
  const fresh = freshState();
  assert.equal(fresh.onboarded, false);
  assert.equal(fresh.lastExport, 0);
  // A backup written before these fields existed must still import, and must
  // not accidentally mark a new browser as already onboarded.
  const legacy = freshState();
  delete legacy.onboarded;
  delete legacy.lastExport;
  legacy.completed = ["js-values"];
  const restored = validateProgress(legacy);
  assert.equal(restored.onboarded, false);
  assert.equal(restored.lastExport, 0);
  assert.deepEqual(restored.completed, ["js-values"]);
  for (const bad of ["true", 1, {}, null])
    assert.equal(sanitizeState({ ...freshState(), onboarded: bad }).onboarded, false);
  for (const bad of ["yesterday", -1, NaN, Infinity, null, {}])
    assert.equal(sanitizeState({ ...freshState(), lastExport: bad }).lastExport, 0);
  const kept = sanitizeState({ ...freshState(), onboarded: true, lastExport: 1757808000000 });
  assert.equal(kept.onboarded, true);
  assert.equal(kept.lastExport, 1757808000000);
});
test("long notes and code drafts are preserved rather than silently truncated", () => {
  const state = freshState();
  state.notes.scratchpad = "Long note ".repeat(12000);
  state.drafts["play-js"] = "// code\n".repeat(15000);
  const restored = validateProgress(state);
  assert.equal(restored.notes.scratchpad, state.notes.scratchpad);
  assert.equal(restored.drafts["play-js"], state.drafts["play-js"]);
});
test("streak handles today, yesterday, gaps and month boundaries", () => {
  const now = new Date(2026, 8, 1, 12);
  assert.equal(dayKey(now), "2026-09-01");
  assert.equal(streak({ "2026-09-01": 1, "2026-08-31": 1 }, now), 2);
  assert.equal(streak({ "2026-08-31": 1, "2026-08-30": 2 }, now), 2);
  assert.equal(streak({ "2026-08-30": 1 }, now), 0);
});
test("review intervals match the learner-facing policy", () => {
  assert.equal(scheduleReview(null, "again", 0).due, 600000);
  assert.equal(scheduleReview(null, "hard", 0).due, 86400000);
  assert.equal(scheduleReview(null, "good", 0).interval, 1);
  assert.equal(
    scheduleReview({ interval: 1, count: 1 }, "good", 0).interval,
    3,
  );
  assert.equal(
    scheduleReview({ interval: 60, count: 20 }, "good", 0).interval,
    60,
  );
});
test("rendered user code and notes cannot inject HTML", () => {
  assert.equal(
    escapeHtml('<img onerror="x">'),
    "&lt;img onerror=&quot;x&quot;&gt;",
  );
  assert.ok(!highlight('const x = "<script>";').includes("<script>"));
});
test("every project ships a weighted rubric that sums to its total", () => {
  for (const p of projects) {
    assert.ok(p.rubric, `${p.id} has a rubric`);
    assert.ok(p.rubric.criteria.length >= 4);
    assert.equal(typeof p.rubric.pass, "number");
    const total = p.rubric.criteria.reduce((s, c) => s + c.weight, 0);
    assert.equal(total, 100, `${p.id} weights sum to 100`);
  }
});
test("highlight colours per language and stays HTML-safe", () => {
  // A JS keyword is coloured for js; a C#-only keyword is left plain there.
  const js = highlight("let x = 1;", "js");
  assert.ok(js.includes('<span class="tok-keyword">let</span>'));
  assert.ok(js.includes('<span class="tok-number">1</span>'));
  assert.ok(!highlight("foreach (x)", "js").includes("tok-keyword"));
  // C# keeps foreach/var/in; it does not know `let`.
  const cs = highlight("foreach (var x in y)", "cs");
  assert.ok(cs.includes('<span class="tok-keyword">foreach</span>'));
  assert.ok(cs.includes('<span class="tok-keyword">var</span>'));
  assert.ok(!highlight("let x", "cs").includes("tok-keyword"));
  // Block comments colour under an explicit language, not in the default set.
  assert.ok(highlight("/* hi */", "js").includes('<span class="tok-comment">'));
  assert.ok(!highlight("/* hi */").includes("tok-comment"));
  // Markup inside a string is escaped, never emitted as a tag.
  const escaped = highlight('const s = "<b>";', "js");
  assert.ok(escaped.includes("&lt;b&gt;"));
  assert.ok(!escaped.includes("<b>"));
});
test("hintTiers stages generic help and always ends with a solution", () => {
  const generic = hintTiers({ sections: [["Idea", "Start from the input."]] });
  assert.equal(generic.length, 3);
  assert.equal(generic[0].title, "Where to start");
  assert.equal(generic[0].body, "Start from the input.");
  assert.ok(generic.at(-1).solution);
  // Authored hints replace the generic tiers but the solution still trails.
  const authored = hintTiers({ hints: ["First nudge", "Second nudge"] });
  assert.equal(authored.length, 3);
  assert.equal(authored[0].title, "Hint 1");
  assert.equal(authored[1].body, "Second nudge");
  assert.ok(authored.at(-1).solution);
  // A lesson with no sections still yields both generic tiers + the solution.
  assert.equal(hintTiers({}).length, 3);
});
test("rubricScore weights checked criteria against the pass line", () => {
  const rubric = {
    pass: 80,
    criteria: [{ weight: 20 }, { weight: 30 }, { weight: 30 }, { weight: 20 }],
  };
  assert.deepEqual(rubricScore(rubric, []), { percent: 0, passed: false, pass: 80 });
  assert.equal(rubricScore(rubric, [0, 1]).percent, 50);
  assert.equal(rubricScore(rubric, [1, 2]).passed, false); // 60 < 80
  assert.equal(rubricScore(rubric, [0, 1, 2]).percent, 80); // exactly the line
  assert.equal(rubricScore(rubric, [0, 1, 2]).passed, true); // >= passes
  assert.deepEqual(rubricScore(rubric, [0, 1, 2, 3]), { percent: 100, passed: true, pass: 80 });
  // No criteria never divides by zero.
  assert.equal(rubricScore({ criteria: [] }, []).percent, 0);
});
test("resolveTheme honours an explicit choice and falls back to the OS", () => {
  assert.equal(resolveTheme("dark", false), "dark");
  assert.equal(resolveTheme("light", true), "light");
  assert.equal(resolveTheme("system", true), "dark");
  assert.equal(resolveTheme("system", false), "light");
  assert.equal(resolveTheme(undefined, true), "dark");
});
test("sanitizeState accepts and clamps the hints and rubrics maps", () => {
  const state = freshState();
  state.hints = { "js-values": 3, "js-loops": 99, bad: "x", neg: -4 };
  state.rubrics = { habit: [0, 0, 5, 99], expense: [3, 1], bad: "nope" };
  const normalized = sanitizeState(state);
  assert.equal(normalized.hints["js-values"], 3);
  assert.equal(normalized.hints["js-loops"], 5); // clamped to the tier ceiling
  assert.equal(normalized.hints.bad, undefined);
  assert.equal(normalized.hints.neg, undefined); // negatives are dropped, not kept
  assert.deepEqual(normalized.rubrics.habit, [0, 5]); // deduped, out-of-range dropped
  assert.deepEqual(normalized.rubrics.expense, [3, 1]);
  assert.equal(normalized.rubrics.bad, undefined);
});
