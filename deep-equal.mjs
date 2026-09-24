// The single source of truth for "did the learner's value match the expected
// one?". Used by the C# path (server.mjs) and the curriculum verifier
// (tests/verify-curriculum.mjs). The JS runner worker keeps a hardened INLINE
// copy of this logic (see public/runner-worker.js) because its CSP is
// `script-src 'unsafe-eval'` with no 'self', so it cannot import a module —
// keep the two in sync.
//
// Semantics deliberately mirror JSON round-tripping, which is how checks were
// compared before, but WITHOUT being fooled by key order:
//   * object keys are compared order-INSENSITIVELY (JSON.stringify was not),
//   * arrays are order-SENSITIVE,
//   * NaN equals NaN (so a check expecting NaN can pass),
//   * a key whose value is `undefined` is ignored on both sides, matching
//     JSON.stringify dropping such keys.
// Lives at the repo root (not under public/) so it is never shipped to the
// browser or added to the build allow-list.
const hasOwn = Object.prototype.hasOwnProperty;

export function structuralEqual(a, b) {
  if (a === b) return true;
  // NaN: never === itself, but the two values are structurally equal.
  if (typeof a === "number" && typeof b === "number") return a !== a && b !== b;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object")
    return false;

  const aArray = Array.isArray(a);
  if (aArray !== Array.isArray(b)) return false;

  if (aArray) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++)
      if (!structuralEqual(a[i], b[i])) return false;
    return true;
  }

  // Plain objects: compare own keys whose value is not `undefined`.
  const aKeys = Object.keys(a).filter((k) => a[k] !== undefined);
  const bKeys = Object.keys(b).filter((k) => b[k] !== undefined);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (!hasOwn.call(b, key)) return false;
    if (!structuralEqual(a[key], b[key])) return false;
  }
  return true;
}
