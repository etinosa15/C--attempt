"use client";

// Loads the .NET WebAssembly runtime that compiles + runs C# in the browser — the
// client-side execution half of Phase 4. The runtime is a published .NET WASM app
// (see the `dotnet-runner/` project) served as static files under `/dotnet/`; it
// exposes one [JSExport], `ForgeRunner.Interop.CompileAndRun(source)`, which uses
// Roslyn in-process to compile the given Program.cs, run it capturing stdout, and
// return a small JSON result. No server-side code execution is involved — this is
// the security posture the plan requires (WASM moves execution to the client).
//
// It is loaded ON DEMAND (the runtime is tens of MB) and only when a learner
// actually runs C#. When the runtime isn't deployed in this environment the import
// throws and the caller degrades to the existing read-only / local-edition path —
// so nothing here changes behavior until the `/dotnet/` bundle ships.
//
// NOTE: this bridge talks to a runtime that is built + deployed separately; it
// cannot be exercised by the unit tests. The pure, tested half (harness generation
// + grading) lives in ./cs-harness. Keep provider-specific assumptions minimal.

/** The result shape `CompileAndRun` returns (as JSON) from the .NET side. */
export interface CsWasmResult {
  /** Program stdout (marker lines + the learner's own output), when it ran. */
  stdout?: string;
  /** Set when Roslyn rejected the program; the compiler diagnostics. */
  compileError?: string;
  /** Set when the program threw outside the per-check try/catch. */
  runtimeError?: string;
  /** Set when execution hit the runtime's wall-clock cap. */
  timedOut?: boolean;
}

export interface CsWasmRunner {
  compileAndRun(programSource: string): Promise<CsWasmResult>;
}

/** Minimal shape of the dotnet.js bootstrap we depend on. */
type DotnetBootstrap = {
  dotnet: {
    create: () => Promise<{
      getAssemblyExports: (name: string) => Promise<unknown>;
      getConfig: () => { mainAssemblyName?: string };
    }>;
  };
};

type ForgeExports = {
  ForgeRunner: {
    Interop: {
      Init: () => Promise<string>;
      CompileAndRun: (source: string) => string;
    };
  };
};

const DEFAULT_BASE = "/dotnet";

// One runtime per page: creating the .NET runtime is expensive, so cache the
// in-flight/created runner and hand the same one to every run.
let runnerPromise: Promise<CsWasmRunner> | null = null;

/**
 * Load (once) and return the C# WASM runner, or reject when the runtime isn't
 * deployed / failed to start. The dynamic import specifier is a runtime URL the
 * bundler must not try to resolve at build time (the files only exist after the
 * dotnet-runner project is published into `public/dotnet/`).
 */
export function loadCsWasmRunner(base = DEFAULT_BASE): Promise<CsWasmRunner> {
  if (runnerPromise) return runnerPromise;
  runnerPromise = (async () => {
    const url = `${base}/_framework/dotnet.js`;
    const mod = (await import(
      /* webpackIgnore: true */ /* turbopackIgnore: true */ url
    )) as unknown as DotnetBootstrap;
    const { getAssemblyExports, getConfig } = await mod.dotnet.create();
    const main = getConfig().mainAssemblyName ?? "ForgeRunner.dll";
    const exports = (await getAssemblyExports(main)) as ForgeExports;
    // Init loads Roslyn's reference assemblies (async); must finish before the
    // first compile. CompileAndRun itself is synchronous on the .NET side.
    await exports.ForgeRunner.Interop.Init();
    return {
      compileAndRun: (programSource: string) => {
        const raw = exports.ForgeRunner.Interop.CompileAndRun(programSource);
        return Promise.resolve(JSON.parse(raw) as CsWasmResult);
      },
    };
  })();
  // Let a failed load be retried on a later run rather than caching the rejection.
  runnerPromise.catch(() => {
    runnerPromise = null;
  });
  return runnerPromise;
}

/**
 * Is the C# WASM runtime deployed in this environment? A cheap probe for a small
 * marker the publish step writes next to the runtime, cached for the page so each
 * C# lesson doesn't re-check. Never throws — a missing runtime resolves false.
 */
let availabilityProbe: Promise<boolean> | null = null;
export function probeCsWasm(base = DEFAULT_BASE): Promise<boolean> {
  if (availabilityProbe) return availabilityProbe;
  availabilityProbe = fetch(`${base}/forge-runner.json`, { method: "GET", cache: "no-store" })
    .then((res) => res.ok)
    .catch(() => false);
  return availabilityProbe;
}
