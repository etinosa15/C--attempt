import test from "node:test";
import assert from "node:assert/strict";
import { heuristicProvider, firstFailure, createTutor } from "../public/tutor.js";

const lesson = {
  lang: "js",
  hints: ["Think about the empty string.", "Trace greet(\"\") by hand."],
  challenge: {
    tests: [
      { label: "greets a name", expected: "Hi, Ada" },
      { label: "handles empty input", expected: "Hi there" },
    ],
    solution: "…",
  },
};

test("firstFailure finds the first not-passing result", () => {
  assert.equal(firstFailure([{ passed: true }, { passed: true }]), null);
  assert.deepEqual(firstFailure([{ passed: true }, { passed: false, label: "x" }]).index, 1);
});

test("all checks passing produces no advice", async () => {
  const advice = await heuristicProvider.respond({
    lesson,
    results: [{ passed: true }, { passed: true }],
  });
  assert.equal(advice, null);
});

test("a failing check names the check and its expected value", async () => {
  const advice = await heuristicProvider.respond({
    lesson,
    results: [{ passed: true }, { passed: false }],
    tier: 0,
  });
  assert.equal(advice.kind, "check");
  assert.match(advice.message, /handles empty input/);
  assert.match(advice.message, /Hi there/);
  assert.equal(advice.offerSolution, false);
  assert.equal(advice.suggestedTier, 2);
});

test("after repeated failures it offers the worked solution", async () => {
  const advice = await heuristicProvider.respond({
    lesson,
    results: [{ passed: false }, { passed: false }],
    tier: 2,
  });
  assert.equal(advice.offerSolution, true);
  assert.match(advice.message, /worked solution/);
});

test("a thrown error is routed through explainError", async () => {
  const advice = await heuristicProvider.respond({
    lesson,
    results: [],
    error: "ReferenceError: greet is not defined",
  });
  assert.equal(advice.kind, "error");
  assert.equal(advice.offerSolution, false);
  assert.ok(advice.message.length > 0);
});

test("createTutor delegates to its provider", async () => {
  const tutor = createTutor();
  assert.equal(tutor.provider, heuristicProvider);
  const advice = await tutor.respond({ lesson, results: [{ passed: true }, { passed: true }] });
  assert.equal(advice, null);
});
