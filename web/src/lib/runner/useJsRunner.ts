"use client";

// The JavaScript runner. Learner code runs in a throwaway Web Worker — off the
// main thread, with no DOM, network or storage reachable — created fresh for each
// run and terminated after (or on timeout, to kill an infinite loop). The worker
// itself is the vanilla studio's repo-root runner-worker.js, reused verbatim: it
// captures prototype refs before running untrusted code and compares results with
// order-insensitive structural equality, so a submission can't fake a pass.
import { useCallback, useEffect, useRef, useState } from "react";
import type { ChallengeTest, RunResult } from "@/lib/curriculum";

interface WorkerResult {
  logs?: string[];
  results?: {
    label: string;
    expected: unknown;
    actual?: unknown;
    error?: string;
    passed: boolean;
  }[];
  error?: string;
}

// Generous enough for the exercises here; short enough that a runaway loop is
// caught quickly. The worker is terminated when it trips.
const RUN_TIMEOUT_MS = 5000;

export function useJsRunner() {
  const [running, setRunning] = useState(false);
  // Track the in-flight worker/timer so we can tear them down if the component
  // unmounts mid-run (otherwise the worker runs on until its timeout, and finish()
  // would setState on an unmounted hook).
  const activeWorker = useRef<Worker | null>(null);
  const activeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);

  useEffect(
    () => () => {
      mounted.current = false;
      if (activeTimer.current) clearTimeout(activeTimer.current);
      activeWorker.current?.terminate();
    },
    [],
  );

  const run = useCallback(
    (code: string, tests: ChallengeTest[]): Promise<RunResult> => {
      setRunning(true);
      return new Promise<RunResult>((resolve) => {
        let settled = false;
        const worker = new Worker(
          new URL("../../../../public/runner-worker.js", import.meta.url),
        );
        const finish = (result: RunResult) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          worker.terminate();
          activeWorker.current = null;
          activeTimer.current = null;
          if (mounted.current) setRunning(false);
          resolve(result);
        };
        const timer = setTimeout(
          () =>
            finish({
              ok: false,
              output: "",
              error:
                "Your code took longer than 5 seconds to run — check for a loop that never ends.",
              checks: [],
            }),
          RUN_TIMEOUT_MS,
        );
        activeWorker.current = worker;
        activeTimer.current = timer;
        worker.onmessage = ({ data }: MessageEvent<WorkerResult>) => {
          const output = (data.logs ?? []).join("\n");
          if (data.error) {
            finish({ ok: false, output, error: data.error, checks: [] });
            return;
          }
          const checks = (data.results ?? []).map((r) => ({
            label: r.label,
            passed: r.passed,
            expected: r.expected,
            actual: r.error ? undefined : r.actual,
          }));
          const ok = checks.length > 0 ? checks.every((c) => c.passed) : true;
          finish({ ok, output, checks });
        };
        worker.onerror = (e) =>
          finish({
            ok: false,
            output: "",
            error: e.message || "The runner failed to start.",
            checks: [],
          });
        worker.postMessage({ code, tests });
      });
    },
    [],
  );

  return { run, running };
}
