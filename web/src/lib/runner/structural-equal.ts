// Structural equality for grading, kept in sync with the repo-root deep-equal.mjs
// (and its hardened inline twin in public/runner-worker.js). The hosted C# WASM
// runner grades client-side — the compiled program emits each check's value as
// JSON, and this is how we decide "did the learner's value match the expected
// one?", with the SAME semantics everywhere so JS and C# grade identically:
//   * object keys compared order-INSENSITIVELY,
//   * arrays order-SENSITIVE,
//   * NaN equals NaN,
//   * a key whose value is `undefined` is ignored on both sides (matches JSON).

const hasOwn = Object.prototype.hasOwnProperty;

// A generous ceiling on nesting. Lesson values are shallow JSON, so real inputs are
// nowhere near this; the cap only exists so a (future, non-JSON) caller passing a
// self-referential object can't blow the stack — it resolves "too deep" as not-equal
// rather than recursing forever.
const MAX_DEPTH = 100;

export function structuralEqual(a: unknown, b: unknown, depth = 0): boolean {
  if (a === b) return true;
  if (depth > MAX_DEPTH) return false;
  // NaN: never === itself, but the two values are structurally equal.
  if (typeof a === "number" && typeof b === "number") return a !== a && b !== b;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object")
    return false;

  const aArray = Array.isArray(a);
  if (aArray !== Array.isArray(b)) return false;

  if (aArray) {
    const bArr = b as unknown[];
    const aArr = a as unknown[];
    if (aArr.length !== bArr.length) return false;
    for (let i = 0; i < aArr.length; i++)
      if (!structuralEqual(aArr[i], bArr[i], depth + 1)) return false;
    return true;
  }

  const aObj = a as Record<string, unknown>;
  const bObj = b as Record<string, unknown>;
  const aKeys = Object.keys(aObj).filter((k) => aObj[k] !== undefined);
  const bKeys = Object.keys(bObj).filter((k) => bObj[k] !== undefined);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (!hasOwn.call(bObj, key)) return false;
    if (!structuralEqual(aObj[key], bObj[key], depth + 1)) return false;
  }
  return true;
}
