# Forge Code Academy — Next.js edition (Phase 0)

This is the **Phase 0 foundation** from [`../docs/phase-0-plan.md`](../docs/phase-0-plan.md):
durable accounts + progress on **Supabase** (Auth + Postgres + RLS), wired alongside
the existing vanilla app as a **strangler migration**. The old app in the repo root is
untouched and still runs; this app adds real accounts, email verification, password
reset, cross-device sync, and data export/delete.

## What's here

- **Auth** (`src/app/login`, `signup`, `reset`, `update-password`, `src/app/auth/*`) —
  email + password, GitHub/Google OAuth, email verification, and password reset, all
  provider-backed by Supabase.
- **Progress API** (`src/app/api/progress`) — reads/writes the learner's `progress`
  JSONB row. Reuses the **exact merge rules** from repo-root `public/core.js` (single
  source of truth) with optimistic concurrency on `revision` in place of the old file
  store's per-key lock.
- **Client sync** (`src/lib/progress/sync-client.ts`) — localStorage when signed out
  (offline, zero network), a one-time **adopt** merge on sign-in, delta sync when
  signed in. Device-local prefs (theme, buddy, focus timer) stay in the browser.
- **Account** (`src/app/api/account`) — GDPR **export** (JSON download) and **delete**
  (erasure via the service role).
- **Analytics** — PostHog initialised from day one (no-op without a key).

## Setup

1. **Create a Supabase project** at [supabase.com](https://supabase.com).
2. **Run the schema:** open the SQL editor and run
   [`supabase/migrations/0001_phase0_profiles_progress.sql`](supabase/migrations/0001_phase0_profiles_progress.sql).
   It creates `profiles` + `progress`, enables RLS, and adds the signup + revision triggers.
3. **Configure env:** `cp .env.local.example .env.local` and fill in the values from
   **Project Settings → API** (URL, anon key, service-role key). Optionally add PostHog
   and the legacy app URL.
4. **Auth providers:** in **Authentication → Providers**, enable GitHub and/or Google
   (add their OAuth client IDs/secrets). In **Authentication → URL Configuration**, add
   `http://localhost:3000/auth/callback` and `http://localhost:3000/auth/confirm` as
   redirect URLs (and your production equivalents later).
5. **Run it:**

   ```bash
   npm run dev
   ```

## Notes

- `next.config.ts` sets `experimental.externalDir` so this app can import the shared
  merge logic from repo-root `public/core.js` without copying it (the codebase
  deliberately keeps one copy to avoid drift).
- Routes that import `core.js` run on the **Node.js runtime** (`export const runtime = "nodejs"`)
  because it uses `structuredClone`.
- The service-role key is **server-only** and never prefixed `NEXT_PUBLIC_`.

## Not in Phase 0 (later)

Embedding the runner + lessons into this shell, payments/Paddle, entitlements, the
reverse-trial state machine, C# WASM, and gamification. Phase 0 only makes accounts
durable and recoverable.
