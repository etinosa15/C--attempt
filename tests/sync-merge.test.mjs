import test from "node:test";
import assert from "node:assert/strict";
import {
  freshState, sanitizeState, progressChanges, applyProgressChanges, sanitizeChanges,
  adoptState, DEVICE_LOCAL,
} from "../public/core.js";

const withState = (fields) => ({ ...freshState(), ...fields });

test("changes from another device cannot reach through to Object.prototype", () => {
  // applyProgressChanges assigns through result[name][key]; an unfiltered
  // ["__proto__", …] path would write onto every object in the process.
  const hostile = [
    { path: ["__proto__", "polluted"], value: "yes" },
    { path: ["constructor", "polluted"], value: "yes" },
    { path: ["notes", "__proto__"], value: "yes" },
    { path: ["notes", "constructor"], value: "yes" },
    { path: ["prototype", "polluted"], value: "yes" },
  ];
  assert.deepEqual(sanitizeChanges(hostile), []);
  applyProgressChanges(freshState(), sanitizeChanges(hostile));
  assert.equal({}.polluted, undefined);
  assert.equal(Object.prototype.polluted, undefined);
});

test("a forged additive flag cannot turn a setting into a counter", () => {
  // `add` is re-derived from the field, never trusted, or a caller could send
  // goal twice and have the values accumulate.
  const forged = sanitizeChanges([{ path: ["goal"], before: 0, value: 60, add: true }]);
  assert.equal(forged[0].add, false);
  const once = applyProgressChanges(freshState(), forged);
  assert.equal(applyProgressChanges(once, forged).goal, 60);
  // A genuinely additive field keeps its flag.
  assert.equal(sanitizeChanges([{ path: ["focusSeconds"], before: 0, value: 5 }])[0].add, true);
  assert.equal(sanitizeChanges([{ path: ["activity", "2026-09-23"], before: 0, value: 1 }])[0].add, true);
});

test("changes outside the saved shape are dropped", () => {
  assert.deepEqual(sanitizeChanges([
    { path: ["version"], value: 99 },
    { path: ["password"], value: "x" },
    { path: ["notes"], value: "not a map entry" },
    { path: ["goal", "extra"], value: 1 },
    { path: ["completed"], append: 42 },
    { path: ["completed", "key"], append: "a" },
    { path: ["projectChecks", "p"], step: 99, value: true },
    { path: ["rubrics", "p"], step: -1, value: true },
    { path: ["notes", "a", "b"], value: "deep" },
    { path: "notes", value: "x" },
    null, undefined, "change", 7,
  ]), []);
  assert.deepEqual(sanitizeChanges("not an array"), []);
  assert.deepEqual(sanitizeChanges(undefined), []);
  // Valid step edits survive, clamped to each field's own range.
  assert.equal(sanitizeChanges([{ path: ["projectChecks", "p"], step: 5, value: true }]).length, 1);
  assert.equal(sanitizeChanges([{ path: ["projectChecks", "p"], step: 6, value: true }]).length, 0);
  assert.equal(sanitizeChanges([{ path: ["rubrics", "p"], step: 11, value: true }]).length, 1);
  assert.equal(sanitizeChanges([{ path: ["rubrics", "p"], step: 12, value: true }]).length, 0);
});

test("two devices' work merges instead of one replacing the other", () => {
  const server = withState({
    completed: ["js-values"],
    focusSeconds: 100,
    activity: { "2026-09-20": 2 },
  });
  // Both devices start from the same snapshot and work offline.
  const laptop = withState({ ...structuredClone(server), completed: ["js-values", "js-loops"], focusSeconds: 160, activity: { "2026-09-20": 2, "2026-09-21": 3 } });
  const phone = withState({ ...structuredClone(server), completed: ["js-values", "js-arrays"], focusSeconds: 130, activity: { "2026-09-20": 5 } });

  let merged = applyProgressChanges(server, sanitizeChanges(progressChanges(server, laptop)));
  merged = applyProgressChanges(merged, sanitizeChanges(progressChanges(server, phone)));

  assert.deepEqual([...merged.completed].sort(), ["js-arrays", "js-loops", "js-values"]);
  // 60 seconds from the laptop plus 30 from the phone, not one overwriting the other.
  assert.equal(merged.focusSeconds, 190);
  assert.equal(merged.activity["2026-09-20"], 5);
  assert.equal(merged.activity["2026-09-21"], 3);
});

test("merge order does not change the result", () => {
  const server = withState({ focusSeconds: 10, activity: { "2026-09-20": 1 } });
  const a = withState({ ...structuredClone(server), focusSeconds: 40, activity: { "2026-09-20": 4 }, completed: ["x"] });
  const b = withState({ ...structuredClone(server), focusSeconds: 25, activity: { "2026-09-20": 1, "2026-09-22": 2 }, completed: ["y"] });
  const changesA = sanitizeChanges(progressChanges(server, a));
  const changesB = sanitizeChanges(progressChanges(server, b));

  const ab = applyProgressChanges(applyProgressChanges(server, changesA), changesB);
  const ba = applyProgressChanges(applyProgressChanges(server, changesB), changesA);
  assert.deepEqual({ ...ab, completed: [...ab.completed].sort() }, { ...ba, completed: [...ba.completed].sort() });
});

test("a merged record still satisfies the saved-state rules", () => {
  const server = freshState();
  const device = withState({
    completed: ["js-values"], solved: ["js-values"],
    notes: { "js-values": "my notes" }, hints: { "js-values": 2 },
    rubrics: { "p-1": [0, 3] }, projectChecks: { "p-1": [1] },
    goal: 60, focusSeconds: 45, lastLesson: "js-values", onboarded: true,
  });
  const merged = applyProgressChanges(server, sanitizeChanges(progressChanges(server, device)));
  // sanitizeState is the server's second line of defence: whatever the merge
  // produced still has to fit the schema it will be served back as.
  assert.deepEqual(sanitizeState(merged), merged);
});

test("hint and rubric progress only ever moves forward on merge", () => {
  const server = withState({ rubrics: { "p-1": [0, 1] } });
  const device = withState({ rubrics: { "p-1": [0, 1, 4] } });
  const merged = applyProgressChanges(server, sanitizeChanges(progressChanges(server, device)));
  assert.deepEqual(merged.rubrics["p-1"], [0, 1, 4]);
});

test("first-contact adopt never doubles a counter against itself", () => {
  // The decisive case: a device that has recorded 400 focus seconds signs into
  // an account that also holds 400. A delta replay would send +400 and land on
  // 800 — adoptState takes the larger side, so the learner keeps 400.
  const account = withState({ focusSeconds: 400, activity: { "2026-09-20": 5 } });
  const local = withState({ focusSeconds: 400, activity: { "2026-09-20": 5 } });
  const merged = adoptState(account, local);
  assert.equal(merged.focusSeconds, 400);
  assert.equal(merged.activity["2026-09-20"], 5);
});

test("adopt unions sets and keeps the higher counter per key", () => {
  const account = withState({
    completed: ["js-values"], solved: ["js-values"],
    focusSeconds: 300, activity: { "2026-09-20": 5, "2026-09-21": 2 },
    focusByDay: { "2026-09-20": 300 },
  });
  const local = withState({
    completed: ["js-loops"], solved: ["js-loops"],
    focusSeconds: 120, activity: { "2026-09-20": 3, "2026-09-22": 7 },
    focusByDay: { "2026-09-22": 120 },
  });
  const merged = adoptState(account, local);
  assert.deepEqual([...merged.completed].sort(), ["js-loops", "js-values"]);
  assert.deepEqual([...merged.solved].sort(), ["js-loops", "js-values"]);
  // Larger side per key — never the sum.
  assert.equal(merged.focusSeconds, 300);
  assert.equal(merged.activity["2026-09-20"], 5);
  assert.equal(merged.activity["2026-09-21"], 2);
  assert.equal(merged.activity["2026-09-22"], 7);
  assert.equal(merged.focusByDay["2026-09-20"], 300);
  assert.equal(merged.focusByDay["2026-09-22"], 120);
});

test("adopt keeps a passed quiz passed from either side", () => {
  const account = withState({ quizzes: { "q-1": true, "q-2": false } });
  const local = withState({ quizzes: { "q-2": true, "q-3": false } });
  const merged = adoptState(account, local);
  assert.equal(merged.quizzes["q-1"], true);
  assert.equal(merged.quizzes["q-2"], true);
  // Never-passed quizzes are not stored at all — the schema keeps only trues.
  assert.equal(merged.quizzes["q-3"], undefined);
});

test("adopt unions checked step indices for projects and rubrics", () => {
  const account = withState({ projectChecks: { "p-1": [0, 2] }, rubrics: { "p-1": [1] } });
  const local = withState({ projectChecks: { "p-1": [1, 2] }, rubrics: { "p-1": [0, 3] } });
  const merged = adoptState(account, local);
  assert.deepEqual(merged.projectChecks["p-1"], [0, 1, 2]);
  assert.deepEqual(merged.rubrics["p-1"], [0, 1, 3]);
});

test("adopt keeps the account's writing and fills only its empty slots", () => {
  const account = withState({ notes: { "js-values": "account note" } });
  const local = withState({ notes: { "js-values": "device note", "js-loops": "device only" } });
  const merged = adoptState(account, local);
  // The account's text wins where it exists; the device fills where it is empty.
  assert.equal(merged.notes["js-values"], "account note");
  assert.equal(merged.notes["js-loops"], "device only");
});

test("adopt takes the running timer from the local device only", () => {
  // focusTimer is device-local: the account's copy is meaningless on this
  // machine, so the local one is always kept.
  assert.deepEqual(DEVICE_LOCAL, ["focusTimer"]);
  const account = withState({ focusTimer: { remainingMs: 1000, accountedAt: 999 } });
  const local = withState({ focusTimer: { remainingMs: 500, accountedAt: null } });
  const merged = adoptState(account, local);
  assert.deepEqual(merged.focusTimer, local.focusTimer);
});

test("an adopted record still satisfies the saved-state rules", () => {
  const account = withState({
    completed: ["js-values"], notes: { "js-values": "a" }, focusSeconds: 45,
    rubrics: { "p-1": [0, 3] }, goal: 60, onboarded: true,
  });
  const local = withState({ completed: ["js-loops"], focusSeconds: 20, lastLesson: "js-loops" });
  const merged = adoptState(account, local);
  assert.deepEqual(sanitizeState(merged), merged);
});

test("a track certificate merges per language without double-counting", () => {
  // Each track's earned date is set once, so the merge is last-writer-per-key,
  // never additive: two devices earning different tracks keep both dates.
  const server = withState({ certificates: {} });
  const laptop = withState({ ...structuredClone(server), certificates: { js: 111 } });
  const phone = withState({ ...structuredClone(server), certificates: { cs: 222 } });
  let merged = applyProgressChanges(server, sanitizeChanges(progressChanges(server, laptop)));
  merged = applyProgressChanges(merged, sanitizeChanges(progressChanges(server, phone)));
  assert.equal(merged.certificates.js, 111);
  assert.equal(merged.certificates.cs, 222);
});

test("adopt keeps the earliest earned date for each track", () => {
  const account = withState({ certificates: { js: 500, cs: 900 } });
  const local = withState({ certificates: { js: 300 } });
  const merged = adoptState(account, local);
  assert.equal(merged.certificates.js, 300, "the earliest proof of practice wins");
  assert.equal(merged.certificates.cs, 900);
});

test("the certificate name follows the account-wins scalar rule", () => {
  const account = withState({ certName: "Ada Lovelace" });
  const local = withState({ certName: "" });
  assert.equal(adoptState(account, local).certName, "Ada Lovelace");
  assert.equal(adoptState(local, account).certName, "Ada Lovelace");
  // A field-level change replaces the scalar rather than accumulating.
  const server = withState({ certName: "" });
  const device = withState({ ...structuredClone(server), certName: "Grace" });
  const merged = applyProgressChanges(server, sanitizeChanges(progressChanges(server, device)));
  assert.equal(merged.certName, "Grace");
});

