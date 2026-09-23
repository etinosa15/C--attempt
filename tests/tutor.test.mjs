import test from "node:test";
import assert from "node:assert/strict";
import { heuristicProvider, firstFailure, createTutor, createRemoteProvider } from "../public/tutor.js";

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

test("a remote provider with no origin is just the offline fallback", () => {
  assert.equal(createRemoteProvider({ origin: "" }), heuristicProvider);
});

const failing = { lesson, results: [{ passed: true }, { passed: false }], tier: 0 };

test("the remote provider upgrades the message but keeps the heuristic's ladder", async () => {
  let sent;
  const provider = createRemoteProvider({
    origin: "https://tutor.example",
    fetchImpl: async (url, init) => {
      sent = { url, init };
      return { ok: true, json: async () => ({ message: "Trace greet(\"\") and see what your guard returns." }) };
    },
  });
  const advice = await provider.respond(failing);
  assert.equal(sent.url, "https://tutor.example/api/tutor");
  assert.equal(sent.init.headers["X-Forge-Tutor"], "1");
  assert.match(advice.message, /Trace greet/);
  // Ladder decisions stay deterministic: same tier/solution flags as the heuristic.
  const base = await heuristicProvider.respond(failing);
  assert.equal(advice.suggestedTier, base.suggestedTier);
  assert.equal(advice.offerSolution, base.offerSolution);
  assert.equal(advice.kind, base.kind);
});

test("the remote provider sends the learner's code but never the solution", async () => {
  let body;
  const provider = createRemoteProvider({
    origin: "https://tutor.example",
    fetchImpl: async (_url, init) => { body = JSON.parse(init.body); return { ok: true, json: async () => ({ message: "hi" }) }; },
  });
  await provider.respond({ ...failing, code: "function greet(n){ return n; }" });
  assert.match(body.code, /function greet/);
  assert.equal("solution" in body, false);
  assert.equal(JSON.stringify(body).includes(lesson.challenge.solution), false);
});

test("the remote provider stays silent when every check passes — no request", async () => {
  let called = false;
  const provider = createRemoteProvider({
    origin: "https://tutor.example",
    fetchImpl: async () => { called = true; return { ok: true, json: async () => ({ message: "x" }) }; },
  });
  const advice = await provider.respond({ lesson, results: [{ passed: true }, { passed: true }] });
  assert.equal(advice, null);
  assert.equal(called, false, "a passing run must not reach the network");
});

test("the remote provider falls back to the heuristic on any failure", async () => {
  const base = await heuristicProvider.respond(failing);
  for (const fetchImpl of [
    async () => { throw new Error("network down"); },
    async () => ({ ok: false, json: async () => ({}) }),
    async () => ({ ok: true, json: async () => ({ message: "" }) }),
    async () => ({ ok: true, json: async () => { throw new Error("bad json"); } }),
  ]) {
    const advice = await createRemoteProvider({ origin: "https://tutor.example", fetchImpl }).respond(failing);
    assert.deepEqual(advice, base);
  }
});
