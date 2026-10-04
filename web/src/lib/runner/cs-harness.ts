// The pure half of the hosted C# runner (Phase 4). Running C# in the browser via
// the .NET WASM runtime splits cleanly into two parts: compiling + running the
// program (the runtime's job — see useCsWasmRunner / the dotnet loader), and
// everything around it, which is pure string work and lives here so it can be
// unit-tested without a .NET toolchain:
//
//   * buildCsharpProgram — wrap the learner's code in the same test harness the
//     loopback studio uses (server.mjs `executeCSharp`), so each check becomes a
//     marker-prefixed JSON line on stdout;
//   * gradeCsharpOutput — parse that stdout back into the shared RunResult,
//     grading each check with structuralEqual.
//
// This is a faithful port of the proven loopback logic (repo-root server.mjs),
// minus the dotnet-CLI-specific bits (runtimeconfig.json, compile.rsp) that the
// in-process Roslyn host doesn't need. Keeping it identical means a C# challenge
// grades the same whether it ran on the local .NET SDK or in the browser.

import { structuralEqual } from "./structural-equal";
import type { ChallengeTest, RunResult } from "../curriculum/types";

/** Prefix the harness stamps on each check's JSON line (matches server.mjs). */
export const FORGE_MARKER = "__FORGE_RESULT__";

// Namespaces every submission gets for free, so lesson code and test expressions
// can use the common BCL types without ceremony. Mirrors server.mjs exactly.
const DEFAULT_USINGS =
  "using System;\nusing System.Collections.Generic;\nusing System.Linq;\nusing System.Threading;\nusing System.Threading.Tasks;\nusing System.Text;\nusing System.Text.Json;\nusing System.IO;\n";

// A whole-line `using …;` (incl. `global using` / `using static`). Hoisted above
// the harness because C# requires using-directives before top-level statements.
const USING_LINE = /^\s*(global\s+)?using\s+(?:static\s+)?[\w.]+\s*;\s*$/gm;

/** One parsed marker line: the test index plus its value or the thrown message. */
type HarnessLine = { index: number; actual?: unknown; error?: string };

/**
 * Build the full Program.cs source for a submission: the learner's code with its
 * `using` directives hoisted, preceded by a try/catch per test that serializes the
 * check's value (or caught error) as a marker-prefixed JSON line. The `#line`
 * directive re-bases compiler diagnostics onto the learner's own code so error
 * messages point at the right line.
 */
export function buildCsharpProgram(code: string, tests: ChallengeTest[]): string {
  const imports: string[] = [];
  const body = code.replace(USING_LINE, (m) => {
    imports.push(m.trim());
    return "";
  });

  const harness = tests
    .map(
      (test, i) =>
        `try {\n object? forgeValue${i} = (object?)(${test.expression});\n Console.WriteLine("${FORGE_MARKER}" + JsonSerializer.Serialize(new { index = ${i}, actual = forgeValue${i} }));\n} catch(Exception forgeError${i}) { Console.WriteLine("${FORGE_MARKER}" + JsonSerializer.Serialize(new { index = ${i}, error = forgeError${i}.Message })); }`,
    )
    .join("\n");

  return (
    DEFAULT_USINGS +
    imports.join("\n") +
    "\nConsole.OutputEncoding = new UTF8Encoding(false);\n" +
    harness +
    '\n#line 1 "YourCode.cs"\n' +
    body
  );
}

/**
 * Parse the program's stdout into a RunResult. Marker lines are decoded as check
 * results and graded against their test's expected value (structuralEqual, so a
 * key-order or NaN difference never flips a pass); every other line is program
 * output. A program that exits before emitting all its checks is surfaced as an
 * error, exactly like the loopback path.
 */
export function gradeCsharpOutput(stdout: string, tests: ChallengeTest[]): RunResult {
  const logs: string[] = [];
  const checks: RunResult["checks"] = [];

  for (const line of stdout.split(/\r?\n/).filter(Boolean)) {
    if (!line.startsWith(FORGE_MARKER)) {
      logs.push(line);
      continue;
    }
    let item: HarnessLine;
    try {
      item = JSON.parse(line.slice(FORGE_MARKER.length)) as HarnessLine;
    } catch {
      logs.push(line); // not valid JSON — treat as ordinary output
      continue;
    }
    const test = tests[item.index];
    if (!test) continue;
    checks.push({
      label: test.label,
      expected: test.expected,
      actual: item.error ? undefined : item.actual,
      passed: !item.error && structuralEqual(item.actual, test.expected),
    });
  }

  const incomplete = tests.length > 0 && checks.length !== tests.length;
  const error = incomplete ? "The program exited before all checks completed." : undefined;
  const ok = !error && (checks.length > 0 ? checks.every((c) => c.passed) : true);
  return { ok, output: logs.join("\n"), error, checks };
}
