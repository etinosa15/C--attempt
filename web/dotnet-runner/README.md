# ForgeRunner — in-browser C# runner (Phase 4)

A .NET **WebAssembly** app that compiles and runs C# **entirely in the learner's
browser**, so a Pro learner on the hosted site can Check C# without the local
edition's loopback .NET program. This keeps the security posture the monetization
plan requires: **no new server-side code-execution surface** — compilation and
execution both happen client-side in this WASM module.

## How it fits together

```
web/src/lib/runner/cs-harness.ts      pure: wrap submission in the test harness,
                                      parse stdout, grade with structuralEqual  ✅ tested
          │  Program.cs source
          ▼
web/dotnet-runner/  (this project)    [JSExport] CompileAndRun(source):
   Interop.cs                           Roslyn compile → run → capture stdout → JSON
          │  published to
          ▼
web/public/dotnet/_framework/…        the servable WASM bundle (gitignored)
          ▲  loaded on demand by
          │
web/src/lib/runner/dotnet-loader.ts   import('/dotnet/_framework/dotnet.js'),
web/src/lib/runner/useCsWasmRunner.ts  Init() → CompileAndRun → grade → RunResult
          ▲  used (behind the Pro gate) by
          │
web/src/app/learn/lesson/[id]/Challenge.tsx
```

The web-side TypeScript (harness, loader, hook, wiring) is already in place and
**degrades to the existing read-only / local-edition behavior whenever this bundle
isn't deployed** — so the live app is unchanged until `/dotnet/` ships.

## ⚠️ Status: committed as source, NOT yet built or verified

This project was written without a .NET WASM toolchain or a browser to test in. It
is a faithful, close-to-correct starting point, **not** a verified build. Treat the
first successful publish + browser smoke test as **Phase 4, Unit 2**. Known parts to
verify (also flagged `VERIFY (Unit 2)` in `Interop.cs`):

1. **Reference-assembly loading.** Roslyn needs the BCL as `MetadataReference`s. In
   browser-wasm `Assembly.Location` is empty, so `Interop.LoadReferencesAsync`
   fetches each loaded assembly's PE bytes from `_framework/{name}.dll`. This relies
   on `WasmEnableWebcil=false` (set in the csproj) so those files are real PE, not
   WebCIL. Confirm the exact served path/extension against a real publish.
2. **Execution timeout.** Single-threaded WASM can't pre-empt an infinite loop in
   the submission, so there's no hard wall-clock cap yet (a runaway loop hangs the
   tab). The harness's per-check `try/catch` only bounds exceptions. Add a watchdog
   (threads) or cooperative-cancellation rewrite before relying on it for untrusted
   input at scale.
3. **Bundle size / hosting.** The published runtime is tens of MB. It is
   **gitignored** (`web/.gitignore`: `public/dotnet/`) — do not commit it. Deploy by
   building in CI before `next build`, or host the bundle on a CDN and point
   `dotnet-loader.ts` at it.

## Prerequisites

```bash
dotnet workload install wasm-tools
```

## Build & deploy

From this directory:

```bash
./build.sh        # macOS/Linux
```
```powershell
pwsh ./build.ps1  # Windows
```

Either publishes `-c Release` and copies the `browser-wasm/AppBundle` into
`web/public/dotnet/`, then writes `forge-runner.json` (the marker
`dotnet-loader.ts` probes). Then run the Next app and, as a **Pro** learner, open a
C# lesson beyond the free floor and press **Check** — the label should read
"Running C# in your browser · .NET" and checks should grade.

See [`docs/phase-2-3-deploy.md`](../../docs/phase-2-3-deploy.md) for how this slots
into the overall go-live.
