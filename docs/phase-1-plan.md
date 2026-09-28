# Phase 1 — React port: the learning surface moves into the Next shell

> Companion to [monetization-plan.md](monetization-plan.md) and
> [phase-0-plan.md](phase-0-plan.md). Phase 0 (durable accounts + sync bridge) is
> **live** — the vanilla studio on Render syncs to the Next+Supabase app on Vercel
> through the legacy `/api/sync` adapter. Phase 1 **replaces that bridge with a
> native React learning surface** inside `web/`, so the studio and the app become
> one origin, one session, one codebase.
>
> **Guiding principle (from the master plan): port the UI, not the engine.** The
> retention core — state model, revision-merge, spaced-repetition scheduler,
> curriculum data, code runners, DOM sandbox — is already pure, DOM-free, and
> imported by `web/` today. Phase 1 rebuilds only `public/app.js`'s rendering,
> routing, and orchestration in React, and re-shells the localStorage store.

## Goal & exit criteria

Phase 1 is done when:
1. A learner can do **everything the vanilla studio does** — dashboard, lesson
   pages (understand/predict/practice/reflect), JS runner, C# runner (same
   hosted-read-only / local-run split), review flashcards, projects, notebook,
   playground + DOM lab, settings, certificates — **inside the Next app**, signed
   in, syncing through `/api/progress` (not the legacy `/api/sync`).
2. **Local-first still holds:** signed-out learners work offline against
   `localStorage`; signing in adopts/merges local progress up (reusing
   `adoptState` + the revision-merge engine unchanged).
3. **Brand identity is preserved:** copper `--accent:#b4531e`, Liquid Glass
   surfaces, aurora background, self-hosted Satoshi/Clash Display/JetBrains Mono,
   Ember the mascot, and token-swap theming with the pre-paint anti-flash script.
4. **Device-local prefs stay device-local:** theme (`forge.academy.theme`) and
   buddy (`forge.academy.buddy`) never enter the synced `state`.
5. **SEO/marketing pages are server-rendered** (SSG) — landing, pricing shell,
   about — so the funnel is indexable. No paywall logic yet (that's Phase 2).
6. The vanilla studio in `public/` can be **retired from deploy** once the React
   surface reaches parity; the legacy `/api/sync` + `/api/auth/*` adapter routes
   can be marked deprecated (kept until the Render studio is fully decommissioned).

## What we REUSE vs REBUILD

The single most important Phase 1 fact: the boundary between "engine" and "shell"
already exists and is clean. The three architecture maps confirm it.

### Reuse verbatim (no re-port — import or re-export through `core.ts`)
- **`public/core.js`** — the entire pure core: `freshState`/`sanitizeState`/
  `validateProgress` (state contract), the revision-merge engine
  (`progressChanges`/`applyProgressChanges`/`sanitizeChanges`/`adoptState`),
  `scheduleReview` (spaced repetition), `streak`/`dayKey`/`activity`, `hintTiers`/
  `explainError`, `certificateEarned`/`certificateSvg`, `rubricScore`,
  `highlight`/`escapeHtml`/`indentOnEnter` (editor helpers), `formatValue`/
  `valueKind`/`typeMismatch` (runner output), `resolveTheme`, `FOCUS_SESSION_MS`.
  `web/` already imports it via `externalDir`; Phase 1 just **widens
  `web/src/lib/progress/core.ts`** to re-export the learning-surface symbols it
  doesn't surface yet (today it exposes only the sync subset).
- **Curriculum data** — `public/curriculum.js` + `js-lessons.js` + `cs-lessons.js`
  (tracks, modules, bridges, projects, all lesson content). Import as-is; wrap in
  TS types (below). Identical lesson shape for JS/C#.
- **`public/runner-worker.js`** — the JS Web Worker executor (4s timeout, inlined
  deep-equal). Reuse the worker file verbatim; instantiate from React.
- **`public/runner-client.js`** — the C# loopback HTTP client (127.0.0.1
  `server.mjs`). Reuse; the hosted-read-only vs local-run split is unchanged.
- **`public/dom-preview.{js,html,css}`** — the sandboxed DOM lab (opaque-origin
  iframe, `connect-src 'none'`). Reuse the sandbox document; embed via `<iframe>`.
- **Server + sync infra already built in Phase 0** — `handlers.ts` (optimistic
  concurrency), `sync-client.ts` (`pullProgress`/`pushChanges`/
  `adoptLocalProgress`), all Supabase clients, `route-auth.ts`, the DB schema.

### Rebuild in React (this is the actual Phase 1 work)
- **`public/app.js` (1936 lines)** — hash routing, full-`#app` re-render,
  `data-action` global event delegation, `bindEditor`, engine→DOM orchestration.
  Becomes React Router-equivalent (Next App Router segments) + components + hooks.
- **`public/progress-store.js` (175 lines)** — the stateful localStorage store +
  change tracking. Replaced by a `useProgress` hook over `sync-client.ts` + React
  state (offline `localStorage` when signed out; sync when signed in).
- **`public/ui.js`, `dock.js`, `focus.js`, `buddy.js`, `tutor.js`** — the UI
  primitives, command dock, focus timer, Ember mascot, and tutor surface. Ported
  to React components/hooks (the *logic* in `tutor.js`/`core.js` is reused; only
  the DOM wiring is rebuilt).
- **The design layer** — `web/` has **no tokens and no fonts** today (ad-hoc CSS
  Modules, wrong gold accent `#c8971f`). Establish the `:root`/dark token set,
  copy `public/fonts`, and port the Liquid Glass system from `public/styles.css`.

## Architecture: the engine boundary

```
          ┌─────────────────────────── web/ (Next App Router) ───────────────────────────┐
          │  Server Components (SSG/SSR)          Client Components ("use client")         │
          │  • marketing / SEO pages              • learning surface (dashboard, lesson,   │
          │  • /learn shell (session gate)          editor, review, playground, settings)  │
          │        │                                        │                              │
          │        │ getUser() (server)                     │ useProgress() hook           │
          │        ▼                                        ▼                              │
          │  lib/supabase/server.ts            lib/progress/sync-client.ts  ── /api/progress│
          │                                     lib/progress/core.ts ──┐                    │
          └───────────────────────────────────────────────────────────┼────────────────────┘
                                                                        │ import (externalDir)
                            public/core.js  ·  curriculum.js  ·  runner-worker.js  ·  dom-preview
                                          (pure engine — SHARED, never forked)
```

The rule: **React components never reimplement engine logic.** They call pure
functions from `core.ts` and render the result. State flows one way — engine
computes, hook holds, component renders, `data-action` equivalents dispatch back
through the hook. This keeps the eventual C# WASM swap (Phase 4) and any future
port isolated to the engine files, never the UI.

## TypeScript contracts to define (`web/src/lib/curriculum/types.ts`)

Today `state.ts` is deliberately loose (`Record<string, unknown>`). Phase 1 adds
**typed views** for the learning surface without changing the wire contract:

```ts
interface Lesson {
  id: string; lang: "js" | "cs"; module: string; title: string; minutes: number;
  lead: string; sections: [heading: string, body: string][];
  example: string; explanation: string; trap: string;
  quiz: { question: string; choices: string[]; answer: number; why: string };
  challenge: { prompt: string; starter: string; solution: string;
               tests: { label: string; expression: string; expected: unknown }[] };
  recall: string; hints: string[]; docs: string;
}
interface Track { lang: "js" | "cs"; title: string; modules: Module[]; }
interface Module { id: string; title: string; lessons: Lesson[]; }
interface Project { id: string; title: string; /* … */ checks: unknown[]; }
type RunResult = { logs: string[];
  results: { label: string; actual?: unknown; error?: string;
             expected: unknown; passed: boolean }[] };
```

The synced `ProgressState` shape stays authoritative in `core.js` (`freshState`):
`completed, quizzes, solved, drafts, notes, reviews, activity, projectChecks,
hints, rubrics, certificates, certName, lastLesson, goal, focusSeconds,
focusByDay, focusTimer, onboarded, lastExport`. Type it once and render against it.

## Route / screen inventory (port map from `public/app.js`)

Hash routes become Next segments under a `/learn` shell (client-rendered, session
-aware). Each maps to a React component:

| Studio hash route | Next route | Component |
|---|---|---|
| `#overview` | `/learn` | `<Overview>` (dashboard: streak, resume, activity) |
| `#paths[/js\|cs\|compare\|all]` | `/learn/paths` | `<Paths>` (track/module browser) |
| `#lesson/<id>` | `/learn/lesson/[id]` | `<Lesson>` (understand/predict-quiz/practice-editor/reflect) |
| `#playground?lang=` | `/learn/playground` | `<Playground>` + DOM-lab iframe |
| `#review` | `/learn/review` | `<Review>` (spaced-repetition flashcards) |
| `#projects` / `#project/<id>` | `/learn/projects[/[id]]` | `<Projects>` / `<ProjectDetail>` |
| `#notebook` | `/learn/notebook` | `<Notebook>` |
| `#settings` | `/learn/settings` | `<Settings>` (account/appearance/buddy/goal/backups/runtime) |
| `#local-setup` / `#privacy` / `#terms` | static SSG pages | server components |

Cross-cutting (persistent shell, not per-route): sidebar/topbar, breadcrumbs,
Ember (`<Buddy>` persistent), command palette (Ctrl+K), certificate + celebration
`<dialog>` overlays, toast, aurora background. These live in the `/learn` layout so
they survive navigation (matching the studio's persistent body-level DOM).

## Editor & runner components

- **`<Editor>`** — replaces `bindEditor()`. A controlled textarea (or CodeMirror if
  we accept the dep; default: keep the lightweight textarea + `highlight`/
  `indentOnEnter` from `core.js` to stay same-origin/offline). Drafts persist
  through the progress hook.
- **`useJsRunner()`** — instantiates `new Worker("/runner-worker.js")`, posts
  `{code, tests}`, resolves `RunResult`. The worker file ships in `web/public/`.
- **`useCsRunner()`** — wraps `runner-client.js`; hosted build stays **read-only**
  (toast + bail, as today), local edition calls loopback `server.mjs`. **The
  loopback compiler stays a separate 127.0.0.1 program — never merged into the
  Next app, never internet-exposed.**

## Design system port

1. **Tokens** — create `web/src/app/tokens.css` (or a `:root` block in
   `globals.css`) with the studio's surfaces/brand/status/spacing/type-scale/glass
   variables from `public/styles.css`. **Reconcile the accent: use copper
   `#b4531e`**, not the landing's gold `#c8971f`.
2. **Fonts** — copy `public/fonts` into `web/public/fonts`; port the `@font-face`
   blocks (Satoshi/Clash Display/JetBrains Mono). Keeps CSP same-origin + offline.
3. **Anti-flash** — port the pre-paint inline theme script (studio
   `index.html:13-30`) into the root layout `<head>` (Next `beforeInteractive`
   script or inline). Its sha256 must be pinned in the app CSP just like the studio.
4. **Delivery** — token stylesheet global + CSS Modules per component (matches
   `web/`'s existing convention; no Tailwind). Port `styles.css`'s 19 sections
   incrementally, screen by screen, as each component lands.
5. **Theme + buddy prefs** — read/write `forge.academy.theme` and
   `forge.academy.buddy` in `localStorage` via small client hooks; apply theme
   through `documentElement.dataset.theme`. **Never** add these to synced `state`.

## Session & sync wiring

- **Signed-out:** `useProgress` reads/writes `localStorage` (`STORAGE_KEY`), zero
  network — local-first preserved.
- **Sign-in:** call `adoptLocalProgress()` (already built) to merge the device
  snapshot up, then switch the hook to server-backed: `pullProgress` on mount,
  `pushChanges` (field-level deltas) on mutation, against **`/api/progress`** with
  the cookie session — not the legacy `/api/sync` bearer adapter.
- **Session read:** server components use `createClient()` + `getUser()`; client
  components use the browser client + `onAuthStateChange`. The `/learn` shell gates
  on session but degrades gracefully to local-first when signed out.

## Auth & onboarding UX (a Phase 1 design principle)

The vanilla studio buries account/login inside `#settings` because accounts were
bolted onto a local-first vanilla app — there was no session or routing layer to
make auth the front door. The React port removes that constraint (`web/` already
has real `/login`, `/signup`, cookie sessions, and per-request `proxy.ts`), so
auth-first becomes a routing decision, not a rebuild. Phase 1 should:

- **Make the entry professional and obvious.** A signed-out visitor lands on a
  marketing/landing surface with a prominent **Sign in / Get started**, or (config
  choice) is routed straight to a polished auth screen — not a dashboard with a
  hidden settings panel. The `/learn` shell is **session-aware** and decides this.
- **Keep local-first as an explicit "try without an account" choice**, not the
  default confusion. Friction becomes intentional (the learner opts into offline
  mode) rather than an accident of where the login control lives.
- **Move account actions out of Settings** — sign out, export, delete, and the
  signed-in identity belong in a top-bar **account menu**, the pattern users expect
  from a professional app.

This is one instance of a broader standard for the port: **reduce friction and
raise the perceived polish** — surface the important actions where users look for
them, and don't make people hunt through settings for primary flows. Apply this
lens to each screen as it's built, not just auth.

## Sequencing (ordered, incremental — studio stays live throughout)

1. **Design foundation** — tokens + fonts + anti-flash + theme hook in `web/`.
   Reconcile the accent. Nothing user-visible breaks; landing adopts the tokens.
2. **Typed engine surface** — widen `core.ts` to re-export learning symbols; add
   `curriculum/types.ts` and a typed loader for the three curriculum files.
3. **`useProgress` hook** — the client store over `sync-client.ts` (offline +
   synced), replacing `progress-store.js`. Unit-test the offline/sync/adopt paths.
4. **`/learn` shell + Overview** — persistent layout (sidebar, topbar, Ember,
   toast, command palette), then the dashboard. First navigable React surface.
5. **Lesson page + Editor + JS runner** — the core loop (understand/predict/
   practice/reflect), worker execution, draft persistence, completion celebration.
6. **C# runner** — hosted read-only + local loopback, reusing `runner-client.js`.
7. **Review, Projects, Notebook, Playground + DOM lab** — the remaining screens.
8. **Settings + certificates** — account/appearance/buddy/goal/backups/runtime;
   `certificateSvg` overlay.
9. **Marketing/SEO (SSG)** — landing, pricing shell, about; server-rendered,
   indexable. No paywall logic (Phase 2).
10. **Parity check + cutover** — verify feature parity against the studio, then
    retire `public/` from deploy and deprecate the legacy adapter routes. Keep the
    Render studio reachable until the React surface is confirmed in prod.

## Verification

- **Unit tests** (Node test runner, matching the repo's existing `tests/`): the
  `useProgress` offline/sync/adopt logic, curriculum type-loading, the typed
  `core.ts` re-exports resolve. Engine tests already exist and stay green.
- **Preview workflow** (per screen): dev server + console/network checks + snapshot
  + inspect; test the JS runner end-to-end (a lesson's tests go green), theme swap,
  and offline→sign-in adopt.
- **Parity matrix** — a checklist mapping every studio route/action to its React
  equivalent, ticked before cutover (step 10).
- **CSP** — the ported anti-flash inline script's sha256 pinned in the app CSP;
  worker + DOM-lab keep their narrower policies (mirror the studio's per-document
  CSP discipline).

## Security constraints (still binding)

- Loopback C# compiler (`server.mjs`, 127.0.0.1) **never** merges with or is
  internet-exposed alongside the Next app; it stays a separate program.
- Service-role / secret keys and any tutor API keys are **server-only** — never
  `NEXT_PUBLIC_`, never sent to the browser, never committed.
- Access + refresh tokens stay **in-memory only**; theme + buddy prefs stay
  **device-local**, never synced.
- **JS + C# only, no Python.** Prod origins https-only; never ship
  `http://localhost` test values into deploy config.

## Out of scope for Phase 1 (later phases)

Payments, entitlements, paywalls, reverse-trial state machine (Phase 2); discounts
& growth (Phase 3); **C# WASM / Blazor** replacing the loopback compiler (Phase 4);
XP/badges/leaderboards & AI tutor UX (Phase 5); Teams/Edu (Phase 6). Phase 1 only
moves the existing learning surface into React at parity, plus SSG marketing pages.

## What I need from you to start building

- **Green light** to start Phase 1 at step 1 (design foundation), or hold at
  planning.
- **One decision:** editor — keep the lightweight `highlight`/`indentOnEnter`
  textarea (zero new deps, stays offline/same-origin — my recommendation), or adopt
  CodeMirror for richer editing (new dependency, larger bundle). Default: keep the
  textarea.

