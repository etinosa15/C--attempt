import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { resolve } from "./resolve-ts.mjs";

// Same TS type-stripping hook the other unit tests use.
registerHooks({ resolve });

const { structuralEqual } = await import("../web/src/lib/runner/structural-equal.ts");
const { buildCsharpProgram, gradeCsharpOutput, FORGE_MARKER } = await import(
  "../web/src/lib/runner/cs-harness.ts"
);

// --- structuralEqual: same semantics as the repo-root deep-equal.mjs ----------
test("structuralEqual: order-insensitive objects, order-sensitive arrays, NaN", () => {
  assert.equal(structuralEqual({ a: 1, b: 2 }, { b: 2, a: 1 }), true);
  assert.equal(structuralEqual([1, 2, 3], [1, 2, 3]), true);
  assert.equal(structuralEqual([1, 2, 3], [3, 2, 1]), false);
  assert.equal(structuralEqual(NaN, NaN), true);
  assert.equal(structuralEqual({ a: 1, b: undefined }, { a: 1 }), true); // undefined key ignored
  assert.equal(structuralEqual({ a: 1 }, { a: 1, b: 2 }), false);
  assert.equal(structuralEqual("x", "x"), true);
  assert.equal(structuralEqual(1, "1"), false);
});

// --- buildCsharpProgram: harness shape ---------------------------------------
const TESTS = [
  { label: "returns 42", expression: "Solve()", expected: 42 },
  { label: "doubles", expression: "Dbl(3)", expected: 6 },
];

test("buildCsharpProgram hoists usings and wraps each test in a marker line", () => {
  const code = "using System.Numerics;\nint Solve() => 42;\nint Dbl(int n) => n * 2;";
  const program = buildCsharpProgram(code, TESTS);
  // Default usings always present.
  assert.match(program, /using System;/);
  // The learner's own using is hoisted above the harness, not left in the body.
  assert.match(program, /using System\.Numerics;/);
  // One marker-emitting try/catch per test, referencing the expression.
  assert.match(program, /forgeValue0 = \(object\?\)\(Solve\(\)\)/);
  assert.match(program, /forgeValue1 = \(object\?\)\(Dbl\(3\)\)/);
  assert.ok(program.includes(FORGE_MARKER));
  // The learner's body follows the #line directive (diagnostics re-based onto it).
  assert.match(program, /#line 1 "YourCode\.cs"/);
  const afterLine = program.slice(program.indexOf('#line 1 "YourCode.cs"'));
  assert.ok(afterLine.includes("int Solve() => 42;"));
  // The hoisted using is gone from the body (only in the hoisted block up top).
  assert.ok(!afterLine.includes("using System.Numerics;"));
});

// --- gradeCsharpOutput: parse + grade ----------------------------------------
function marker(obj) {
  return FORGE_MARKER + JSON.stringify(obj);
}

test("gradeCsharpOutput grades marker lines and keeps other lines as output", () => {
  const stdout = [
    "hello from the program",
    marker({ index: 0, actual: 42 }),
    marker({ index: 1, actual: 6 }),
  ].join("\n");
  const r = gradeCsharpOutput(stdout, TESTS);
  assert.equal(r.ok, true);
  assert.equal(r.output, "hello from the program");
  assert.equal(r.checks.length, 2);
  assert.ok(r.checks.every((c) => c.passed));
});

test("gradeCsharpOutput fails a wrong value and records expected/actual", () => {
  const stdout = [marker({ index: 0, actual: 41 }), marker({ index: 1, actual: 6 })].join("\n");
  const r = gradeCsharpOutput(stdout, TESTS);
  assert.equal(r.ok, false);
  assert.equal(r.checks[0].passed, false);
  assert.equal(r.checks[0].expected, 42);
  assert.equal(r.checks[0].actual, 41);
  assert.equal(r.checks[1].passed, true);
});

test("gradeCsharpOutput treats a thrown check as failed with no actual", () => {
  const stdout = [
    marker({ index: 0, error: "Object reference not set" }),
    marker({ index: 1, actual: 6 }),
  ].join("\n");
  const r = gradeCsharpOutput(stdout, TESTS);
  assert.equal(r.checks[0].passed, false);
  assert.equal(r.checks[0].actual, undefined);
  assert.equal(r.ok, false);
});

test("gradeCsharpOutput flags a program that exits before all checks run", () => {
  const stdout = marker({ index: 0, actual: 42 }); // only one of two checks
  const r = gradeCsharpOutput(stdout, TESTS);
  assert.equal(r.error, "The program exited before all checks completed.");
  assert.equal(r.ok, false);
});

test("gradeCsharpOutput with no tests is ok and returns raw output", () => {
  const r = gradeCsharpOutput("just some output\nmore", []);
  assert.equal(r.ok, true);
  assert.equal(r.checks.length, 0);
  assert.equal(r.output, "just some output\nmore");
});
