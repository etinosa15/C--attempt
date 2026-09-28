# Phase 1 — Parity matrix (React port ↔ vanilla studio)

Status as of Step 10a. This is the checklist the Phase 1 plan's Verification
section requires ([docs/phase-1-plan.md](phase-1-plan.md)): every screen and
action of the live vanilla studio in `public/` mapped to its React/Next
equivalent in `web/`, with a status tick.

**Legend:** ✅ ported & verified · 🟡 intentional variation (noted) ·
⛔ deferred (not in Phase 1 scope).

The React surface is **not yet cut over** — the vanilla studio in `public/`
stays the live learning surface on Render until the React app is confirmed in
production. The destructive cutover is **Step 10b**, held for a separate,
prod-gated session and documented as a runbook at the end of this file.

## Screens / routes

| Vanilla (`public/`, hash route) | React (`web/`, path) | Status |
| --- | --- | --- |
| `#overview` — `renderOverview` | `/learn` ([learn/page.tsx](../web/src/app/learn/page.tsx)) | ✅ |
| `#paths` — `renderPaths` | `/learn/paths` ([paths/Paths.tsx](../web/src/app/learn/paths/Paths.tsx)) | ✅ |
| `#lesson/:id` — `renderLesson` | `/learn/lesson/[id]` ([lesson/[id]/page.tsx](../web/src/app/learn/lesson/[id]/page.tsx)) | ✅ |
| `#playground` — `renderPlayground` | `/learn/playground` ([playground/page.tsx](../web/src/app/learn/playground/page.tsx)) | ✅ |
| `#review` — `renderReview` | `/learn/review` ([review/page.tsx](../web/src/app/learn/review/page.tsx)) | ✅ |
| `#projects` — `renderProjects` | `/learn/projects` ([projects/page.tsx](../web/src/app/learn/projects/page.tsx)) | ✅ |
| `#project/:id` — `renderProject` | `/learn/projects/[id]` ([projects/[id]/page.tsx](../web/src/app/learn/projects/[id]/page.tsx)) | ✅ |
| `#notebook` — `renderNotebook` | `/learn/notebook` ([notebook/page.tsx](../web/src/app/learn/notebook/page.tsx)) | ✅ |
| `#settings` — `renderSettings` | `/learn/settings` ([settings/Settings.tsx](../web/src/app/learn/settings/Settings.tsx)) | 🟡 |
| `#local-setup` — `renderLocalSetup` | `/local-setup` ([(marketing)/local-setup/page.tsx](../web/src/app/(marketing)/local-setup/page.tsx)) | 🟡 |
| `#privacy` — `renderPrivacy` | `/privacy` ([(marketing)/privacy/page.tsx](../web/src/app/(marketing)/privacy/page.tsx)) | 🟡 |
| `#terms` — `renderTerms` | `/terms` ([(marketing)/terms/page.tsx](../web/src/app/(marketing)/terms/page.tsx)) | 🟡 |

**Screen notes (🟡):**

- **Settings** — device-local preferences only: appearance, daily focus goal
  (with a read-only progress meter), portable backups (export / import / reset),
  and local runtime status. Account actions (sign in/out, export, delete) live
  in the top-bar account menu, one click from every screen — the low-friction,
  professional standard the port is held to — so they are deliberately **not**
  duplicated here. The vanilla study-buddy panel is omitted (no mascot in the
  port yet). A corruption/quota warning banner (new in Step 10a) surfaces the
  store's `problem`/`recovered` state with an export prompt.
- **local-setup / privacy / terms** — moved from the in-app hash routes to the
  **marketing** surface as static, indexable server components (SSG). Copy is
  ported faithfully with two intentional trims: privacy renders the
  accounts-enabled variant **without** the AI-tutor disclosure (the hosted tutor
  is Phase 5, not live), and terms includes the optional-accounts clause. The
  local-setup download button links the hosted studio's generated ZIP (see the
  open item under the runbook).

## Actions / cross-cutting features

| Vanilla action | React equivalent | Status |
| --- | --- | --- |
| Completion certificates (`renderCertificate` / modal) | `CertificateDialog` ([components/CertificateDialog.tsx](../web/src/components/CertificateDialog.tsx)), opened from Overview & Paths at 100% | ✅ |
| Export progress backup | Settings "Export progress" + top-bar "Export my data" (`/api/account/export`) | ✅ |
| Import progress backup | Settings "Import backup" (`readBackupFile`, snapshots `.before-import`) | ✅ |
| Reset all progress | Settings "Reset all progress" (backup downloads first, then confirm) | ✅ |
| Sign in | `/login` ([login/page.tsx](../web/src/app/login/page.tsx)) + top-bar "Sign in" | ✅ |
| Sign up | `/signup` ([signup/page.tsx](../web/src/app/signup/page.tsx)) | ✅ |
| Password reset | `/reset` ([reset/page.tsx](../web/src/app/reset/page.tsx)) | ✅ |
| Sign out | Top-bar account menu → `POST /auth/signout` | ✅ |
| Delete account | Top-bar account menu → `DELETE /api/account` (confirm) | ✅ |
| Sync status indicator | `SyncBadge` in the top bar (`Saved on this device` / `Synced` / `Syncing…` / `Sync paused`) | 🟡 |
| Multi-tab / corruption durability | `local-store.ts` (`.recovery`/`.before-import`/`.before-sync`, `_generation` epoch, Web Locks) + storage-event convergence; 10 unit tests | ✅ |
| Theme (light/dark/system) | `ThemeToggle` + pre-paint boot script; device-local, never synced | ✅ |
| Command palette (`openSearch`, Ctrl-K) | `CommandPalette` ([learn/CommandPalette.tsx](../web/src/app/learn/CommandPalette.tsx)) in the top bar | ✅ |

**Action notes:**

- **Sync status (🟡)** — the vanilla studio surfaced sync state inline in
  Settings; the port promotes it to a persistent top-bar badge so state is
  visible from every screen.
- **Command palette (✅)** — the vanilla `openSearch` fuzzy jump (pages /
  actions / all 40 lessons, Ctrl-K) is now ported as `CommandPalette`, mounted
  in the top bar next to the sync badge. It drives navigation through the Next
  router, toggles the device-local theme in place, and marks completed lessons
  with a ✓; arrow keys move the highlight and Enter activates. The lesson badge
  is a compact text chip (JS / C#) rather than the vanilla devicon logo, to
  avoid the CDN image dependency.

## Verification (Step 10a)

- `cd web && npx tsc --noEmit` → exit 0.
- `local-store.ts` unit tests (Node `node:test`, `tests/local-store.test.mjs`):
  decode-with-fallback across the three backup slots, backup-written-before-
  overwrite, `QuotaExceededError` message, `_generation` mismatch detection —
  all green, alongside the existing engine tests.
- Preview: `/learn/paths` (both module grids, compare tab, checkmarks,
  certificate at 100%, active nav link); `/privacy`, `/terms`, `/local-setup`
  render with marketing chrome and resolving footer links (no 404); corruption
  recovery from `.recovery` surfaces the Settings warning without clobbering the
  damaged primary; theme stays device-local.

---

# HELD — Step 10b cutover runbook (documented, NOT executed)

The following is the **destructive** half of Step 10. It breaks the **live**
Render studio's sync, so it must wait until the React surface is confirmed in
production. **Do not execute these from an in-repo session** — they are recorded
here for the prod-gated session.

1. **Return 410 Gone from the legacy bridge handlers.** Add a shared helper in
   [web/src/lib/api/cors.ts](../web/src/lib/api/cors.ts) and return it from:
   `api/sync`, `api/me`, and `api/auth/{login,signup,logout,refresh,reset,delete}`
   (route files confirmed present). 410 is safe: the vanilla studio's `request()`
   degrades to local mode on it, whereas 401/429 are special-cased and would
   loop. The only consumer is `public/sync-client.js`. Leave the Supabase-backed
   app routes (`api/account`, `api/account/export`, `api/progress`,
   `api/progress/adopt`) untouched — those serve the React app.
2. **Suspend / remove the Render static service.** The `forge-code-academy`
   static service in [render.yaml](../render.yaml) serves the vanilla `dist/`.
   Suspend or delete it once the React app is the live surface. Optionally clear
   the `FORGE_STUDIO_ORIGINS` (Vercel) / `FORGE_SYNC_ORIGIN` (Render) env vars
   that wire the two together.
3. **Keep `public/` on disk.** The Vercel build imports 5 modules from it at
   build time (`core.js`, `curriculum.js`, `focus.js`, `runner-client.js`,
   `runner-worker.js`) via `next.config.ts` `externalDir`. Deleting `public/`
   breaks `next build`. Retire it from *deploy*, not from the repo.

## Open item — local-setup download link

`/local-setup` currently links `https://forge-code-academy.onrender.com/downloads/forge-local.zip`
— the ZIP generated into Render's `dist/` by
[scripts/build-hosted.mjs](../scripts/build-hosted.mjs) and served by the Render
static site. **This link breaks when the Render service is suspended in Step
10b.** Before cutover, choose one:

- copy `forge-local.zip` into `web/public/downloads/` at build so Vercel serves
  it, or
- publish it as a GitHub release asset and link that.

Flagged for confirmation; the default hosted link is a placeholder until then.

