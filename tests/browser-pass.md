# Browser verification — 13 September 2026

Tested the local app using the Chromium-based Codex browser on a separate
`localhost:4330` origin with synthetic progress. This is viewport testing on
Windows, not a physical-device or Safari/Firefox compatibility certification.

## Automated results

- `npm test`: 42 passing behavioral tests.
- `npm run verify:curriculum`: all 132 cases across 40 lessons passed, including real C# compilation/execution with .NET SDK 10.0.400.
- `npm run verify:server`: concurrent partial-body C# requests return one success and one busy response; the next run succeeds after the runner is released.
- JavaScript syntax checks and `git diff --check` passed.

## Browser coverage

| Area | Verified behavior |
| --- | --- |
| Responsive routes | Overview, learning paths, comparison, JS/C# lessons, playground, review, projects, project detail, notebook, settings at 320, 390, 768 and 1440 CSS pixels wide. |
| JavaScript runner | Thrown error, infinite-loop timeout, successful rerun, top-level await, long failure output. |
| C# runner | Success, compiler error, runtime exception, infinite-loop timeout, successful rerun, stopped server error, then retry from the same open page after restart. |
| Learning | C# quiz, all three coding checks, completion, generated review card, reveal, rating and caught-up state. JS challenge failure and corrected solution were also exercised; the preceding keyboard pass covered JS completion. |
| DOM lab | Default button updates output; repeated previews do not duplicate document-level listeners; script errors display and wrap on narrow screens. |
| Projects and notes | Milestones and multiline project notes survive reload; notebook renders long identifiers and HTML-looking text safely. |
| Backups | Actual JSON downloads inspected; exported progress imported after changing a setting; pre-import and automatic downloads contain the expected prior states. Incomplete import rejected; cancel preserves progress. |
| Navigation | C# playground deep link, language switching, search with empty/no-match/matching queries, result focus, browser back/forward. |
| Reviews | Count updates after rating; exploring unlearned cards does not inflate the learned-card sidebar badge. |

Earlier passes in this work also covered keyboard-only navigation, mobile menu
focus, two-tab saves, storage failure/retry, corrupt-save recovery, shared timers,
daily goal completion and local-midnight rollover. Those behaviors remain covered
by the relevant unit tests; this pass focused on the complete browser flows above.

## Fixes from this pass

1. Parse route queries separately so C# playground deep links open the playground; preserve the selected language in the URL.
2. Validate backup collections before confirmation, sharing validation with stored-record recovery while accepting older exports without daily focus fields.
3. Reserve the C# runner after reading the request body so simultaneous submissions cannot both acquire it.
4. Recreate the sandboxed preview frame on every DOM update to discard previous listeners and timers.
5. Wrap long notebook text, DOM errors and failed-check values instead of overflowing or clipping on mobile.
6. Show the caught-up review message when learned concepts exist and none are due.
7. Refresh the learned-card sidebar count without replacing the currently focused control.

To reproduce the DOM regression check, run `document.addEventListener("click", () => console.log("once"));`
in the lab, update the preview twice, then click its button. Only one message
should be emitted. For overflow checks, paste a long identifier without spaces
into project notes and return a long string from an incorrect lesson solution.

The test server was stopped, the test origin's storage restored, and the temporary
viewport override reset after verification. Synthetic backup downloads generated
during the test remain in the browser's Downloads folder.

# Browser verification — 18–21 September 2026

Covers the first-use milestone (open the site, choose a language, complete one lesson,
understand the feedback, save progress, know what comes next), the accessibility and
mobile pass, and the first end-to-end check of the hosted release.

Tested in the Chromium-based preview browser on Windows, against the local edition on
`localhost:4317` and the hosted preview on `localhost:4331`. The preview pane is ~294
CSS pixels wide, so emulated viewports render scaled; every size and contrast figure
below is a DOM/computed-style measurement, not a reading off a screenshot. This is not
a Safari, Firefox or physical-device certification — see *Compatibility* for the line
between what was executed and what was derived.

## Automated results

- `npm test`: 53 passing behavioral tests, before and after the CSS, server and app changes.
- `npm run verify:curriculum`: all 132 cases across 40 lessons passed, with real C# compilation on .NET SDK 10.0.400.
- `npm run verify:server`: concurrent C# submissions reserve one runner and release it.
- `node --check` on the changed `server.mjs` and `public/app.js`.

## Browser coverage

| Area | Verified behavior |
| --- | --- |
| First-use journey | From empty storage: welcome panel appears, both language entries and the "Where your work lives" link are present, the resume control reads **Start**, and after one completed lesson it reads **Continue** and follows the unfinished lesson. Dismissal persists across reloads. |
| Feedback legibility | Check results render Expected/Received per case (`Expected "Hello, Ada!"` / `Received "WRONG OUTPUT"`); a thrown error reports the raised message instead. The output panel is `role="status" aria-live="polite"`, so results are announced without moving focus. |
| Touch targets | Every interactive control measured ≥44×44 px at 320, 390 and 720×450 across 10–13 routes, and ≥24 px at 768 and 1440 (WCAG 2.5.8). Links inline in a sentence are exempt and were left alone; quiz radios stay 13 px because the 313×46 wrapping `<label>` is the target. |
| Reflow | No horizontal overflow at 320, 390, 720×450, 768 or 1440. The only clipped elements are deliberate `.sr-only` labels. |
| Code editor | Gutter and textarea stay in lockstep at 12 px/21.6 px under 720 px, with no horizontal overflow. Tab, Shift+Tab, Esc and Ctrl+Enter behave as the README documents. |
| Keyboard and focus | Tab order through the welcome panel reaches both language buttons and the close button in order; dismissing with the keyboard lands focus on the `H1` rather than dropping it to `<body>`. |
| Contrast | Zero failures across 10 routes, measured against the *composited* painted background — including gradient surfaces such as `.daily-card`, where `backgroundColor` is transparent and a naive walk finds a light ancestor instead. |
| Hosted build | `dist/` holds exactly the 20 allow-listed files; no `.env`, `.git`, `.runtime`, log or `node_modules` content. `_headers` is byte-identical to `staticHeaders()`, and every served document and the worker carry the CSP `policyFor()` assigns them. |
| Hosted routes | `/api/*` returns a 404 explaining there is no compiler API. Unmatched paths return `404.html`. Hash deep links `#lesson/js-values` and `#playground?lang=cs` resolve on a cold load and survive a refresh — the app is hash-routed, so it needs no SPA rewrite rule. |
| Hosted runtime | The JavaScript worker runs and reports output. C# is read-only: Run and Check are disabled and carry their reason, the editor footer and keyboard hint both say so, and `#local-setup` offers the ZIP with a `download` attribute. |
| Download ZIP | 22 entries, no leaked paths, and `deployment.js` correctly keeps `hosted = false` so the downloaded copy keeps its own runner. Extracted to a clean directory and started with `node server.mjs`: it booted, detected .NET SDK 10.0.400, served the app, and **compiled and executed real C#** (a LINQ `Sum()` program) with no reference to the source tree. |
| Compatibility | Executed: the no-Web-Locks path, driven through the real `progress-store.js` with `locks: null`. It refuses to save, leaves storage untouched, keeps `lastSaved` null, and warns the user to export — it does not silently lose work. Derived, not executed: the version floor below. |

## Compatibility floor

The app requires Web Locks, `structuredClone`, `<dialog>.showModal` and
`crypto.randomUUID`; the first and last are secure-context only. All four reached
baseline in March 2022, giving Chrome 98+, Edge 98+, Firefox 98+, Safari 15.4+. This
floor is derived from published support data, not from running those browsers here.
`:has()` is used only to tint checked quiz answers and milestones, so a browser without
it loses the tint and nothing else.

## Fixes from this pass

1. Refresh the topbar resume control after a lesson completes. Completion re-renders only `#main`, so the control kept offering the lesson just finished.
2. Raise check-result, editor and gutter type to 10–12 px so feedback is legible rather than technically present.
3. Split the `#app :is(…)` control-height rule in two. `:is()` takes the specificity of its *most specific* argument, so a list containing `.tabs button` scored (1,1,1) and silently outranked the (1,1,0) mobile rules — pinning phone controls to 36 px regardless of source order.
4. Add 24 px minimums for small header and toolbar controls, matched in specificity to the 44 px phone rules so phones still win.
5. Give the search dialog's close button a 44 px target on phones. The dialog is appended to `<body>`, so no `#app …` rule had ever reached it.
6. Fix `.line-numbers` contrast: `#675775` measured 2.27:1 against the composited editor background and is now `#a294b6` at 5.0:1.
7. Hide the topbar streak label with the clipped `.sr-only` pattern instead of `display: none` under 1000 px, so screen readers no longer announce a bare number with no unit.
8. Serve `404.html` for unmatched paths in the hosted preview. It previously returned JSON, so the real 404 page a visitor gets from the host was never exercised by a release check.
9. Give the disabled C# Run and Check buttons a title stating that running C# requires the local edition. A disabled button is skipped by Tab and otherwise explains nothing.

Two documentation claims were corrected rather than coded around: `package.json`
described the project as "offline-first", but the hosted site has no service worker and
needs the network to load — only the local edition runs offline. The README described a
local-only project with no mention of `npm run build`, `netlify.toml` or the generated
headers.

The hosted preview and the extracted copy were both stopped after verification, and the
temporary extraction directory was removed. To repeat the ZIP check, run `npm run build`,
unpack `dist/downloads/forge-local.zip` into an empty folder outside this repository, and
start it there with `PORT=4342 node server.mjs` so it cannot fall back on the source tree.
