# Forge Code Academy

A personal, local website for studying JavaScript and C# deeply. No npm dependencies, account, API key, or paid service is required.

## Start

On Windows, double-click **Start Forge.cmd** and keep its terminal window open. It starts the server and opens **http://localhost:4317**.

Or, in this folder, run:

```text
npm start
```

Then open http://localhost:4317 in a browser. Press Ctrl+C in the terminal to stop it. Use the same browser and URL to keep accessing your saved progress. If the port is occupied by another program, set `PORT` to another number before starting.

### Opening with VS Code Live Server

Live Server (usually port 5500) serves static files; it does not start Forge's Node.js server or C# compiler. The project-root `index.html` shows launch instructions and a link to the complete academy. Run `npm start` in the VS Code terminal, or double-click `Start Forge.cmd` in File Explorer, then use **http://localhost:4317**. You do not need Live Server to run Forge.

### Requirements

- Node.js 20 or later.
- .NET 10 SDK for the C# runner. JavaScript and lessons work without it. The SDK and runtime are detected locally; there is no NuGet restore or network compilation step.
- A modern browser with Web Workers and localStorage.

**Before you run C#:** your code is compiled and executed by the .NET SDK on your own
machine, as your own user. It is not an operating-system sandbox, so a C# program can
read and write your files exactly as any program you launch yourself can. Run only code
you wrote or trust, and do not expose this server to the internet. The same warning is
repeated in [Local execution and storage](#local-execution-and-storage), next to the
execution details.

### Browser support

Forge needs a browser from **March 2022 or later** — Chrome 98+, Edge 98+, Firefox 98+
or Safari 15.4+. That floor comes from four APIs the app depends on: Web Locks (write
coordination), `structuredClone` (progress snapshots), `<dialog>.showModal` (lesson
search) and `crypto.randomUUID` (backup imports).

Web Locks and `crypto.randomUUID` are only available in a *secure context*, meaning
HTTPS or `localhost`. The local server binds to 127.0.0.1 and the hosted site is served
over HTTPS, so both qualify; reaching the local edition over a LAN IP address on plain
`http://` would not.

Where coordinated saving is unavailable, Forge **refuses to save rather than risking
your work**: it keeps the session in memory and shows a warning asking you to export
before closing the tab. It never writes a partial or unsynchronized record. If
localStorage itself is blocked — private windows in some browsers — the same in-memory
warning applies.

Some styling is progressive. Checked quiz answers and completed milestones get a tinted
background through the CSS `:has()` selector; in a browser without it the native control
still shows the state, and nothing is lost but the tint.

## Hosted deployment

The same codebase publishes as a static reading edition. `npm run build` runs
`scripts/build-hosted.mjs`, which writes `dist/` from an explicit allow-list of public
files — never a directory copy — so nothing outside that list can be published by
accident.

```text
npm run build
npm run preview:hosted
```

The preview serves `dist/` on http://localhost:4331 and behaves like the host: `/api/*`
returns 404 with an explanation, and unmatched paths return `404.html`.

`netlify.toml` builds with the same command and publishes `dist`. The build also writes
`_headers`, generated from `security-policy.mjs` so the static host and the local server
apply one shared policy: a per-document Content-Security-Policy, `nosniff`,
`no-referrer`, and a `Permissions-Policy` denying camera, microphone and geolocation.

The hosted edition has no compiler, so **C# is read-only there**: lessons, drafts and
notes all work, the Run and Check buttons are disabled with the reason shown, and the
C# pages link to `#local-setup`. That page offers `downloads/forge-local.zip`, a
self-contained copy of the local edition — extract it, run `npm start`, and move your
work across with an export/import from **Settings & backups**. The two editions do not
synchronize automatically.

The hosted site needs a network connection to load, because there is no service worker
caching it. The local edition is the one that runs fully offline; only its optional
documentation links reach the internet.

## Sync service (optional accounts)

Accounts and cloud sync are entirely optional and off by default. With no sync service
configured the app makes **zero network calls for accounts**, shows no sign-in UI, and
behaves exactly like the local-first edition. The sync service is a **separate program**
from the local C# compiler in `server.mjs`; the compiler stays loopback-only and is never
merged with, or exposed alongside, the sync API.

Run the sync service with `npm run sync` (it starts `sync-server.mjs`). It is internet-
facing and **must sit behind a TLS-terminating reverse proxy** — it speaks plain HTTP and
sets `Secure` session cookies, so it depends on the proxy for HTTPS. Configure it with
environment variables:

| Variable | Purpose |
|---|---|
| `FORGE_ORIGINS` | **Required.** Comma-separated allow-list of site origins permitted to call the API (CORS + CSRF Origin check), e.g. `https://forge.example`. |
| `FORGE_DATA` | Directory for the file-per-record store (password hashes, sessions, progress). Default `./data`. Back this directory up; it holds every account. |
| `FORGE_CROSS_SITE` | Set when the site and the API are on different sites, so session cookies are issued `SameSite=None` (still `Secure`). |
| `FORGE_TRUST_PROXY` | Set when behind a reverse proxy so the client IP is read from `X-Forwarded-For` for rate limiting. |
| `FORGE_INSECURE_COOKIE` | **Local development only.** Drops the `Secure` cookie flag so sign-in works over plain `http://localhost`. Never set in production. |
| `PORT` | Port the service listens on. Default `4318`. |

The site build learns the service origin from `FORGE_SYNC_ORIGIN` at **build time**:
`FORGE_SYNC_ORIGIN=https://sync.example npm run build` writes that origin into the hosted
`deployment.js` and the `_headers` `connect-src`, from the one validated value in
`security-policy.mjs`. Left unset, the build ships local-only with no account UI.

The `data/` directory is gitignored and never packaged into `dist/`. **Version 1 has no
password reset** — a forgotten password cannot be recovered, so learners should keep
theirs safe and export a backup from **Settings & backups**. Appearance theme is
device-local and is never uploaded. A name you set on a completion certificate is part
of your progress record, so it is included in backups and, if you sign in, synced.

## What is included

- **40 substantial lessons**: 20 JavaScript and 20 C#, from foundations to engineering practice. Every lesson has mental models, worked code, common mistakes, a prediction question, an executable challenge, notes, and an official reference link.
- **132 behavioral checks** across the 40 coding challenges, including empty inputs, boundaries, errors, immutability, and cancellation where applicable.
- **Real execution**: JavaScript in a fresh browser worker; C# compiled by the installed Roslyn compiler and executed on .NET. The runner does not pretend to compile C# or grade code by matching text.
- **Language bridge**: six direct comparisons of JavaScript and C# semantics.
- **Spaced review**: cards created from completed lessons, with Again (10 minutes), With effort (1 day), and Got it (growing intervals up to 60 days). Exploring all cards is also possible. This is a simple transparent heuristic, not a personalized research-grade memory model.
- **Six project briefs** with milestones, suggested starting ideas, official resources, and stretch goals. These are projects for you to implement, not generated completed applications.
- **Notebook, draft autosave, focus timer, search, and progress export/import**.
- **Daily focus goals**: choose 15, 30, 60, or 90 minutes and see today's accumulated time, remaining time, and goal completion in Overview, Playground, and Settings. Focus time is tracked by local calendar day, separately from the lifetime total.
- **A study buddy**: a small mascot that reacts to what you do and, when a check fails, points you at the first failing case. It runs entirely in your browser and its name and hidden/shown state are device-local — never uploaded or included in a backup.
- **A built-in tutor**: offline and deterministic, it names the first failing check (and what it expected) and unlocks staged hints as your checks keep coming up short — escalating to the worked solution only after repeated attempts. No network, no API key, nothing uploaded.
- **Per-track certificates**: complete every lesson in a track (all 20 JavaScript or all 20 C#) and earn a printable, downloadable record of practice. It is framed honestly as a record of practice, not a professional credential.
- **A separate isolated DOM lab** for browser events and HTML practice.

## Suggested study routine

1. Start with JavaScript Foundations or C# Foundations; neither assumes prior coding experience.
2. Read slowly and trace the worked example before executing it.
3. Answer the concept question and solve the challenge. Both are required to mark a lesson complete.
4. Use the hints and solutions after a serious attempt; then rebuild the solution from memory.
5. Explain the concept in your notes and review its card later.
6. After Foundations, build a foundation project. Use the intermediate and capstone projects as the curriculum progresses.

Lesson timings are estimates and exclude extended project work. Completion is a record of practice, not a certification of professional mastery. Reference links point to MDN and Microsoft Learn for deeper study.

## Local execution and storage

The server binds only to 127.0.0.1, checks the Host and Origin headers, and requires a same-origin token for C# execution. It serves only the `public` folder. C# runs as your current OS user and is **not an operating-system sandbox**. Run your own trusted code; do not expose this service on the public internet. C# compilation and execution have time/output limits. JavaScript workers have a 4-second timeout and no network access. The DOM iframe has a separate sandbox and no access to academy storage; unlike a worker, synchronous DOM code can still make its frame unresponsive.

Progress is stored in browser localStorage. Tabs at the same address coordinate writes using Web Locks and synchronize saved changes. Changes to different lessons merge; conflicting edits to the same note, draft, or review leave the second tab's work unsaved with a warning so you can export it before reloading. Coordinated saving needs a browser and origin that support Web Locks — see [Browser support](#browser-support) for the floor and for what happens when it is missing.

Every save keeps the previous valid record as an automatic recovery backup. If the current record is damaged, Forge loads a valid recovery copy when available; otherwise it preserves the damaged record and warns you instead of saving empty progress over it. Storage failures keep your latest work in memory and show a persistent warning with export and retry actions. Closing a tab with unsaved changes prompts you to stay.

Export a backup from **Settings & backups**, especially before clearing browser data or changing browsers. You can also export the automatic recovery copy there. Import deliberately replaces current progress after confirmation and keeps a separate pre-import backup. Tabs with unsaved work cannot overwrite an imported record; they must export their work and reload. Automatic backups stay in the same browser and do not protect against clearing browser data. Notes and code are not sent to an external service. Optional official documentation links require internet access.

Console exercises use one file. ES module imports and ASP.NET server examples are explained as multi-file/project examples rather than executed in that console. Use the DOM lab for `document` and event handlers. Await asynchronous work in the JavaScript console so it completes before the runner ends.

If you restart Forge while a page is open, the next C# run reconnects automatically. Connection checks time out after 5 seconds, and C# requests after 30 seconds. If a run disconnects or times out, check the server and click **Run code** or **Check solution** again when ready; the app does not automatically repeat a program that may already have executed.

The 25-minute focus timer is shared by tabs at the same address. It survives refreshes and keeps counting while the page is closed, up to the end of that session. Pause it when you take a break; resume continues the remaining time, and reset restores a paused 25-minute timer without removing earned time. Sessions crossing local midnight are split between the two dates, and today's progress updates without a reload. Multiple tabs cannot count the same session twice. Old lifetime totals remain intact, but cannot be assigned to historical dates. Imported backups restore their timer paused so an old running session cannot add new time.

## Keyboard navigation

- In the code editor, **Tab** inserts two spaces, **Shift+Tab** moves to the previous control, and **Esc** moves out to the next available run/output control. **Ctrl+Enter** (or **Command+Enter**) runs playground code or checks a lesson solution. These shortcuts are shown below the editor.
- **Ctrl+K** / **Command+K** opens lesson search. Tab through the search field, close button, and results; **Esc** closes search and returns focus to where you were.
- Following a page link moves focus to the new page heading. Lesson section buttons move focus to the requested section, and review controls keep focus with the revealed answer or next card.
- On small screens, the closed navigation menu is skipped by Tab. Open navigation to reach its links; **Esc** or **Close** dismisses it and returns focus to the menu button.

## Checks

```text
npm test
npm run verify:curriculum
npm run verify:server
```

The first command checks progress handling, scheduling, rendering safety, and curriculum integrity. The second executes all 40 reference solutions against all 132 challenge checks, using real .NET for C#. The third verifies that simultaneous C# submissions share one runner and that it is released after completion; it starts a temporary server and requires the .NET SDK.

## File map

- `server.mjs`: dependency-free HTTP server and local C# compiler runner.
- `public/app.js`, `styles.css`: responsive interface and interactions.
- `public/js-lessons.js`, `cs-lessons.js`: authored curriculum and exercises.
- `public/curriculum.js`: tracks, language comparisons, and project briefs.
- `public/core.js`: persistence validation, scheduling, and shared rendering helpers.
- `public/progress-store.js`: coordinated saves, tab synchronization, and recovery backups.
- `public/focus.js`: timer accounting, daily focus totals, and goal progress.
- `public/runner-worker.js`: isolated JavaScript console.
- `public/dom-preview.*`: sandboxed browser lab.
- `public/deployment.js`: marks the hosted build; the static build rewrites it.
- `security-policy.mjs`: the one Content-Security-Policy source, shared by the server and the generated `_headers`.
- `scripts/build-hosted.mjs`: builds `dist/` from an allow-list and packages the local-edition ZIP.
- `tests/`: behavioral and curriculum checks.
- `.runtime/`: transient C# compilation folders; removed after each run.

No build step is necessary to study locally. Edit the files and refresh the page;
`npm run build` is only for publishing the hosted edition.
