"use client";

// The hosted C# runner: compiles + runs C# in the browser via the .NET WASM
// runtime (Phase 4), so a Pro learner on the hosted site can Check C# without the
// local edition's loopback .NET program. It mirrors useCsRunner's shape
// (`{ run, running, available }`) so the lesson UI treats the two interchangeably.
//
// Grading is client-side here (unlike the loopback, which grades server-side):
// buildCsharpProgram wraps the submission in the shared test harness, the runtime
// returns stdout, and gradeCsharpOutput parses it against the lesson's tests with
// the same structural equality every runner uses — so a C# challenge grades
// identically whether it ran on the local SDK or in WASM. The harness's per-check
// try/catch means a thrown check fails that check rather than faking a pass.
//
// `available` is a cheap probe: true only once the `/dotnet/` runtime bundle is
// actually deployed. Until then it resolves false and the challenge UI falls back
// to its existing read-only / local-edition behavior — no change to today's app.
import { useCallback, useEffect, useRef, useState } from "react";
import { buildCsharpProgram, gradeCsharpOutput } from "./cs-harness";
import { loadCsWasmRunner, probeCsWasm, type CsWasmRunner } from "./dotnet-loader";
import type { ChallengeTest, RunResult } from "@/lib/curriculum";

export function useCsWasmRunner() {
  const [running, setRunning] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const runnerRef = useRef<CsWasmRunner | null>(null);

  // Probe once (module-cached, so one check per page regardless of lesson count).
  useEffect(() => {
    let cancelled = false;
    probeCsWasm()
      .then((ok) => !cancelled && setAvailable(ok))
      .catch(() => !cancelled && setAvailable(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const run = useCallback(
    async (code: string, tests: ChallengeTest[]): Promise<RunResult> => {
      setRunning(true);
      try {
        if (!runnerRef.current) runnerRef.current = await loadCsWasmRunner();
        const program = buildCsharpProgram(code, tests);
        const res = await runnerRef.current.compileAndRun(program);

        // Compilation failed — surface the diagnostics as the run error, like the
        // loopback path. No checks ran.
        if (res.compileError) {
          return { ok: false, output: "", error: res.compileError, checks: [] };
        }

        // Parse + grade whatever stdout was produced, then layer on a run-level
        // error for a top-level throw or a timeout (checks already captured).
        const graded = gradeCsharpOutput(res.stdout ?? "", tests);
        if (res.timedOut) {
          return {
            ...graded,
            ok: false,
            error: "Execution stopped after 5 seconds. Check for a loop that never ends.",
          };
        }
        if (res.runtimeError) {
          return { ...graded, ok: false, error: res.runtimeError };
        }
        return graded;
      } catch (err) {
        // Runtime failed to load/run — degrade to a clear failed result; the UI's
        // availability gate normally prevents reaching here.
        return {
          ok: false,
          output: "",
          error:
            err instanceof Error
              ? err.message
              : "The in-browser C# runtime could not start.",
          checks: [],
        };
      } finally {
        setRunning(false);
      }
    },
    [],
  );

  return { run, running, available };
}
