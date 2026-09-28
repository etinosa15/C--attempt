"use client";

// The C# runner. Unlike JavaScript (which runs in an in-browser Web Worker), C#
// needs a real .NET compiler, so it runs in the vanilla studio's loopback program
// (repo-root server.mjs, bound to 127.0.0.1) — a SEPARATE process that is never
// merged into the Next app and never internet-exposed. This hook reuses that
// program's HTTP client verbatim (public/runner-client.js): GET /api/status to
// learn whether a .NET SDK is present and mint a per-run token, then POST /api/run
// with the X-Forge-Token header. Test evaluation is server-side — the client sends
// only the lesson id, and server.mjs looks up that lesson's tests, so a submission
// can't fake a pass.
//
// The hosted/online edition has no loopback runner reachable: the status probe
// fails, `available` resolves false, and the UI falls back to read-only C# (study
// the solution, run it in the local edition). This mirrors the vanilla studio's
// hosted vs. local split exactly — no code path here compiles C# itself.
import { useCallback, useEffect, useRef, useState } from "react";
import { createRunnerClient as createRunnerClientJs } from "../../../../public/runner-client.js";
import type { RunResult } from "@/lib/curriculum";

// The loopback program's /api/status payload (server.mjs: `{ csharp, sdk, token }`,
// with `sdk` clamped to a short string by runner-client before it reaches us).
interface CsStatus {
  csharp: boolean;
  sdk: string;
  token: string;
}

// The loopback program's /api/run payload. `results` are already graded server-side
// (executeCSharp in server.mjs), one entry per lesson test, keyed by index.
interface CsRunResponse {
  logs?: string[];
  results?: {
    index: number;
    label: string;
    expected: unknown;
    actual?: unknown;
    error?: string;
    passed: boolean;
  }[];
  warnings?: string;
  error?: string;
}

interface RunnerClient {
  getStatus: () => Promise<CsStatus>;
  run: (code: string, lessonId?: string) => Promise<CsRunResponse>;
}

// runner-client.js is untyped (its default `onStatus = () => {}` makes TS infer a
// zero-arg callback). Cast the factory to the real contract, the same way core.ts
// wraps the imported engine — the JS stays the single source of truth.
const createRunnerClient = createRunnerClientJs as unknown as (opts?: {
  fetchImpl?: typeof fetch;
  statusTimeoutMs?: number;
  runTimeoutMs?: number;
  onStatus?: (data: CsStatus) => void;
}) => RunnerClient;

// Map the loopback response onto the shared RunResult contract (identical shape to
// useJsRunner's output) so the lesson UI renders JS and C# results the same way.
function toRunResult(data: CsRunResponse): RunResult {
  const output = (data.logs ?? []).join("\n");
  const checks = (data.results ?? []).map((r) => ({
    label: r.label,
    passed: r.passed,
    expected: r.expected,
    actual: r.error ? undefined : r.actual,
  }));
  const ok =
    !data.error && (checks.length > 0 ? checks.every((c) => c.passed) : true);
  return { ok, output, error: data.error, checks };
}

export function useCsRunner() {
  const [running, setRunning] = useState(false);
  // null while we probe; then true/false. `sdk` is the compiler label for chrome.
  const [available, setAvailable] = useState<boolean | null>(null);
  const [sdk, setSdk] = useState("");

  // One client for the component's lifetime. onStatus keeps the SDK label fresh
  // (getStatus runs before every submission, so a runner started mid-session is
  // picked up without a reload).
  const clientRef = useRef<RunnerClient | null>(null);
  if (!clientRef.current) {
    clientRef.current = createRunnerClient({
      onStatus: (data: CsStatus) => setSdk(data.csharp ? data.sdk || "" : ""),
    });
  }

  // Probe once on mount. A reachable runner with a .NET SDK enables Check; anything
  // else (no loopback program, or present but SDK-less) leaves C# read-only.
  useEffect(() => {
    let cancelled = false;
    clientRef
      .current!.getStatus()
      .then((status) => {
        if (!cancelled) setAvailable(!!status.csharp);
      })
      .catch(() => {
        if (!cancelled) setAvailable(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Pass a lessonId to grade against that lesson's server-side tests; omit it for a
  // plain run (output only). Errors from the client (connection, timeout, invalid
  // response) become a failed RunResult carrying the client's guidance message.
  const run = useCallback(
    (code: string, lessonId?: string): Promise<RunResult> => {
      setRunning(true);
      return clientRef
        .current!.run(code, lessonId)
        .then(toRunResult)
        .catch(
          (err: Error): RunResult => ({
            ok: false,
            output: "",
            error: err.message,
            checks: [],
          }),
        )
        .finally(() => setRunning(false));
    },
    [],
  );

  return { run, running, available, sdk };
}
