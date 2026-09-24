/* A fresh worker is created for each run and terminated by the UI on timeout. */

// Structural equality, kept in sync with the repo-root deep-equal.mjs. This
// worker's CSP is `script-src 'unsafe-eval'` with no 'self', so it cannot
// import that module — the logic is inlined here instead. Prototype refs are
// captured up front, BEFORE any learner code runs, so a submission that
// overrides JSON.stringify, Array.prototype methods, or Object.keys cannot
// force a false pass (the old JSON.stringify comparison could be defeated that
// way). Same semantics as deep-equal.mjs: order-insensitive object keys,
// order-sensitive arrays, NaN === NaN, undefined-valued keys ignored.
const $isArray = Array.isArray;
const $keys = Object.keys;
const $hasOwn = Object.prototype.hasOwnProperty;
function structuralEqual(a, b) {
  if (a === b) return true;
  if (typeof a === "number" && typeof b === "number") return a !== a && b !== b;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object")
    return false;
  const aArray = $isArray(a);
  if (aArray !== $isArray(b)) return false;
  if (aArray) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++)
      if (!structuralEqual(a[i], b[i])) return false;
    return true;
  }
  const aKeys = $keys(a).filter((k) => a[k] !== undefined);
  const bKeys = $keys(b).filter((k) => b[k] !== undefined);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (!$hasOwn.call(b, key)) return false;
    if (!structuralEqual(a[key], b[key])) return false;
  }
  return true;
}

self.onmessage = async ({ data }) => {
  const logs = [];
  const format = (value) => {
    if (typeof value === "string") return value;
    try {
      return JSON.stringify(value) ?? String(value);
    } catch {
      return String(value);
    }
  };
  const log = (...values) => {
    if (logs.length < 100)
      logs.push(values.map(format).join(" ").slice(0, 4000));
  };
  const proxy = {
    log,
    info: log,
    warn: log,
    error: log,
    table: log,
    clear: () => {
      logs.length = 0;
    },
  };
  try {
    const AsyncFunction = Object.getPrototypeOf(
      async function () {},
    ).constructor;
    const checks = data.tests || [];
    const body =
      data.code +
      "\n;return await Promise.all([" +
      checks
        .map(
          (t) =>
            `(async()=>{try {return {actual:await (${t.expression})};} catch(e) {return {error:e.message};}})()`,
        )
        .join(",") +
      "]);";
    const returned = await new AsyncFunction("console", body)(proxy);
    if (checks.length && (!Array.isArray(returned) || returned.length !== checks.length))
      throw new Error("Your program returned before all checks completed. Define the requested function without returning from the whole program.");
    const results = checks.length ? returned : [];
    self.postMessage({
      logs,
      results: results.map((r, i) => ({
        ...r,
        label: checks[i].label,
        expected: checks[i].expected,
        passed:
          !r.error &&
          structuralEqual(r.actual, checks[i].expected),
      })),
    });
  } catch (e) {
    self.postMessage({ logs, error: e && typeof e.message === "string" ? (e.name || "Error") + ": " + e.message : "Thrown value: " + format(e) });
  }
};
