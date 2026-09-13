import { randomBytes } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

export function csharpSource(code, tests, marker) {
  const imports = [];
  const body = code.replace(/^\s*(global\s+)?using\s+(?:static\s+)?[\w.]+\s*;\s*$/gm, match => { imports.push(match.trim()); return ""; });
  const harness = tests.map((test, index) => `try { object? value${index} = (object?)(${test.expression}); Console.WriteLine("${marker}" + JsonSerializer.Serialize(new { index = ${index}, actual = value${index} })); } catch(Exception error${index}) { Console.WriteLine("${marker}" + JsonSerializer.Serialize(new { index = ${index}, error = error${index}.Message })); }`).join("\n");
  return "using System;\nusing System.Collections.Generic;\nusing System.Linq;\nusing System.Threading;\nusing System.Threading.Tasks;\nusing System.Text;\nusing System.Text.Json;\nusing System.IO;\n" + imports.join("\n") + "\n" + harness + '\n#line 1 "YourCode.cs"\n' + body;
}
export function parseOnlineResult(result, tests, marker) {
  const decode = value => typeof value === "string" ? Buffer.from(value, "base64").toString("utf8").slice(0, 64000) : "";
  const logs = [], found = new Map();
  for (const line of decode(result.stdout).split(/\r?\n/).filter(Boolean)) {
    if (line.startsWith(marker)) {
      try {
        const item = JSON.parse(line.slice(marker.length)), test = tests[item.index];
        if (test && !found.has(item.index)) found.set(item.index, { index: item.index, actual: item.actual, error: item.error, label: test.label, expected: test.expected, passed: !item.error && JSON.stringify(item.actual) === JSON.stringify(test.expected) });
      } catch { logs.push(line); }
    } else logs.push(line);
  }
  const stderr = decode(result.stderr), compile = decode(result.compile_output);
  if (stderr) logs.push(stderr);
  const status = result.status?.id;
  const error = status === 6 ? compile || "C# compilation failed." : status === 5 ? "Execution stopped at the time limit. Check for an infinite loop." : status !== 3 ? `The online runner could not complete this program (${String(result.status?.description || "unknown status").slice(0, 100)}).` : result.exit_code && result.exit_code !== 0 ? "The program exited with an error." : tests.length !== found.size ? "The program exited before all checks completed." : undefined;
  return { logs, results: [...found.values()].sort((a, b) => a.index - b.index), warnings: status === 6 ? "" : compile, error };
}
export function createOnlineRunner(env, { fetchImpl = fetch, sleep = delay } = {}) {
  let base;
  try { base = new URL(env.JUDGE0_URL); } catch { /* Not connected. */ }
  const language = Number(env.JUDGE0_CSHARP_LANGUAGE_ID);
  const configured = Boolean(base?.protocol === "https:" && !base.username && !base.password && !base.search && !base.hash && Number.isInteger(language) && language > 0 && env.JUDGE0_API_KEY);
  async function request(endpoint, body, deadline) {
    const headers = { "Content-Type": "application/json", "X-Auth-Token": env.JUDGE0_API_KEY };
    if (env.JUDGE0_RAPIDAPI_HOST) { delete headers["X-Auth-Token"]; headers["X-RapidAPI-Key"] = env.JUDGE0_API_KEY; headers["X-RapidAPI-Host"] = env.JUDGE0_RAPIDAPI_HOST; }
    const response = await fetchImpl(`${base.href.replace(/\/$/, "")}${endpoint}`, { method: body ? "POST" : "GET", headers, body: body ? JSON.stringify(body) : undefined, signal: deadline ? AbortSignal.any([deadline, AbortSignal.timeout(10000)]) : AbortSignal.timeout(10000), redirect: "error" });
    if (!response.ok) throw new Error("The online compiler is unavailable or at capacity. Please try again later.");
    const text = await response.text();
    if (text.length > 350000) throw new Error("The compiler response exceeded the output limit.");
    return JSON.parse(text);
  }
  async function execute(code, tests = []) {
    if (!configured) return { error: "Online C# is not connected yet. JavaScript and lessons remain available.", logs: [], results: [] };
    if (typeof code !== "string" || Buffer.byteLength(code) > 80000) return { error: "Code is too large. Use fewer than 80 KB.", logs: [], results: [] };
    const marker = `__FORGE_${randomBytes(12).toString("hex")}__`;
    const deadline = AbortSignal.timeout(30000);
    try {
      const created = await request("/submissions?base64_encoded=true&wait=false", {
        source_code: Buffer.from(csharpSource(code, tests, marker)).toString("base64"), language_id: language, stdin: "", cpu_time_limit: 5, wall_time_limit: 10, memory_limit: 262144,
        max_file_size: 1024, max_processes_and_or_threads: 64, enable_network: false, number_of_runs: 1,
      }, deadline);
      if (!/^[a-zA-Z0-9-]{16,80}$/.test(created.token || "")) throw new Error("The compiler did not accept this run.");
      for (let attempt = 0; attempt < 20; attempt++) {
        deadline.throwIfAborted();
        await sleep(750);
        const result = await request(`/submissions/${created.token}?base64_encoded=true&fields=stdout,stderr,compile_output,status,exit_code`, undefined, deadline);
        if (![1, 2].includes(result.status?.id)) return parseOnlineResult(result, tests, marker);
      }
      return { error: "The compiler is still busy. Wait a moment before trying again.", logs: [], results: [] };
    } catch (error) { return { error: error.name === "TimeoutError" ? "The online compiler timed out. Try again later." : error.message || "The online compiler could not run your code.", logs: [], results: [] }; }
  }
  return { configured, execute };
}
