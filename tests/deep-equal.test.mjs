import test from "node:test";
import assert from "node:assert/strict";
import { structuralEqual } from "../deep-equal.mjs";

test("primitives and identity", () => {
  assert.equal(structuralEqual(1, 1), true);
  assert.equal(structuralEqual("a", "a"), true);
  assert.equal(structuralEqual(true, false), false);
  assert.equal(structuralEqual(1, "1"), false);
  assert.equal(structuralEqual(null, null), true);
  assert.equal(structuralEqual(null, {}), false);
  assert.equal(structuralEqual({}, null), false);
});

test("NaN equals NaN, but not other numbers", () => {
  assert.equal(structuralEqual(NaN, NaN), true);
  assert.equal(structuralEqual(NaN, 0), false);
  assert.equal(structuralEqual(0, NaN), false);
  assert.equal(structuralEqual([NaN], [NaN]), true);
  assert.equal(structuralEqual({ x: NaN }, { x: NaN }), true);
});

test("object keys compare order-insensitively", () => {
  assert.equal(structuralEqual({ a: 1, b: 2 }, { b: 2, a: 1 }), true);
  assert.equal(structuralEqual({ a: 1, b: 2 }, { a: 1, b: 3 }), false);
  assert.equal(structuralEqual({ a: 1 }, { a: 1, b: 2 }), false);
});

test("arrays compare order-sensitively", () => {
  assert.equal(structuralEqual([1, 2, 3], [1, 2, 3]), true);
  assert.equal(structuralEqual([1, 2, 3], [3, 2, 1]), false);
  assert.equal(structuralEqual([1, 2], [1, 2, 3]), false);
});

test("an array is never structurally equal to a plain object", () => {
  assert.equal(structuralEqual([], {}), false);
  assert.equal(structuralEqual({ 0: "a", length: 1 }, ["a"]), false);
});

test("undefined-valued keys are ignored on both sides (JSON parity)", () => {
  assert.equal(structuralEqual({ a: 1, b: undefined }, { a: 1 }), true);
  assert.equal(structuralEqual({ a: 1 }, { a: 1, b: undefined }), true);
  assert.equal(structuralEqual({ a: undefined }, {}), true);
  // A key present with a real value still has to match.
  assert.equal(structuralEqual({ a: 1, b: undefined }, { a: 1, b: 2 }), false);
});

test("nested structures recurse", () => {
  assert.equal(
    structuralEqual(
      { items: [{ id: 1, tags: ["x", "y"] }], meta: { ok: true } },
      { meta: { ok: true }, items: [{ tags: ["x", "y"], id: 1 }] },
    ),
    true,
  );
  assert.equal(
    structuralEqual({ items: [{ tags: ["x", "y"] }] }, { items: [{ tags: ["y", "x"] }] }),
    false,
  );
});

test("cannot be fooled by a live JSON.stringify override", () => {
  const original = JSON.stringify;
  JSON.stringify = () => "same";
  try {
    assert.equal(structuralEqual({ a: 1 }, { a: 2 }), false, "comparator must not depend on JSON.stringify");
    assert.equal(structuralEqual({ a: 1 }, { a: 1 }), true);
  } finally {
    JSON.stringify = original;
  }
});
