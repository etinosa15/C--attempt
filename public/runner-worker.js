/* A fresh worker is created for each run and terminated by the UI on timeout. */
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
    const results = await new AsyncFunction("console", body)(proxy);
    self.postMessage({
      logs,
      results: results.map((r, i) => ({
        ...r,
        label: checks[i].label,
        expected: checks[i].expected,
        passed:
          !r.error &&
          JSON.stringify(r.actual) === JSON.stringify(checks[i].expected),
      })),
    });
  } catch (e) {
    self.postMessage({ logs, error: e.name + ": " + e.message });
  }
};
