# Phase 0 — Deployment cutover runbook

> Companion to [phase-0-plan.md](phase-0-plan.md) (checklist item 8). This is the
> exact, ordered procedure to take the code-complete Phase 0 live.
>
> **Decisions locked (2026-09-26):**
> - **Backend host:** the `web/` Next.js + Supabase app deploys to **Vercel**.
> - **Studio host:** the vanilla studio (`dist/`) stays on **Render** (`render.yaml`).
> - **Email:** **soft-launch on Supabase's built-in email** — no domain, no card,
>   rate-limited to a few messages/hour. Full-volume email (Resend + domain) is a
>   drop-in upgrade later; see [Appendix A](#appendix-a--upgrading-to-resend--a-custom-domain).
> - **OAuth:** GitHub/Google exist only in the Next app's own `/login`. The studio
>   panel stays email+password. Nothing to build.

## Target topology

```
Learner's browser
   │
   ├── studio (static)         https://forge-code-academy.onrender.com   [Render]
   │        │  sync bridge (X-Forge-Sync, bearer token, CORS)
   │        ▼
   └── app (Next + Supabase)   https://forge-app.vercel.app              [Vercel]
            │
            ▼
        Supabase (Auth + Postgres + RLS)                                 [Supabase]
```

The loopback C# compiler (`server.mjs`, 127.0.0.1) is **not** part of any of this
and is never deployed. The old `forge-sync`/`sync-server.mjs` service is retired.

## Prerequisites

- A **Supabase** account (free tier is enough for the soft launch).
- A **Vercel** account connected to the GitHub repo `etinosa15/C--attempt`.
- The existing **Render** account hosting the studio.
- Nothing paid: no domain and no working card are required for this path.

## Step 1 — Create the Supabase project

1. supabase.com → **New project**. Pick a region close to your learners.
2. Save the **database password** somewhere safe (you rarely need it after this).
3. When it finishes provisioning, open **Project Settings → API** and copy:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role** key → `SUPABASE_SERVICE_ROLE_KEY` (**server-only**, secret)

> The service-role key bypasses RLS. It is used by exactly one route
> (`/api/auth/delete` → `admin.auth.admin.deleteUser`) and must never be prefixed
> `NEXT_PUBLIC_`, never sent to the browser, and never committed.

## Step 2 — Create the schema + RLS

Run the migration against the new project. Either:

- **SQL editor (simplest):** open **SQL Editor → New query**, paste the entire
  contents of [`web/supabase/migrations/0001_phase0_profiles_progress.sql`](../web/supabase/migrations/0001_phase0_profiles_progress.sql),
  and **Run**. It is idempotent (`if not exists`, `drop policy if exists`).
- **CLI:** `supabase link` then `supabase db push`.

This creates `profiles` + `progress` with RLS (self-read/write only), the
revision-bump trigger, and the `on_auth_user_created` trigger that seeds a
profile + empty progress row on signup. Verify under **Table Editor** that both
tables exist and **Authentication → Policies** shows RLS enabled.

## Step 3 — Configure Supabase Auth

**Authentication → Providers → Email:**
- **Enable email provider:** on.
- **Confirm email:** **on** (keep it — the pending-signup UX and `/auth/confirm`
  flow are built for this).

**Authentication → Emails / SMTP:** leave **custom SMTP off** for the soft launch
— Supabase's built-in sender is used automatically.

> ⚠️ **Built-in email is rate-limited** (a few messages/hour, shared/best-effort).
> Fine for a beta with a trickle of signups; a burst will hit
> `429 email rate limit exceeded` and those users can't confirm until it clears.
> Mitigations: invite/pre-confirm users manually (**Authentication → Users → Add
> user**, tick *Auto Confirm*), or move to Resend ([Appendix A](#appendix-a--upgrading-to-resend--a-custom-domain)).

**Authentication → URL Configuration** (fill in once you know the Vercel URL from
Step 4 — come back and set these):
- **Site URL:** `https://forge-app.vercel.app`
- **Redirect URLs (allowlist):** add
  `https://forge-app.vercel.app/auth/confirm`,
  `https://forge-app.vercel.app/auth/callback`,
  `https://forge-app.vercel.app/update-password`
  (or the wildcard `https://forge-app.vercel.app/**`).

These match the paths the code sends: `emailRedirectTo=/auth/confirm` (signup),
`redirectTo=/auth/confirm?next=/update-password` (reset), `/auth/callback` (OAuth).

**Optional — OAuth (GitHub/Google) for the Next app's `/login`:** enable the
provider under **Authentication → Providers**, paste its client id/secret, and set
its callback to `https://forge-app.vercel.app/auth/callback`. Skippable for launch.

## Step 4 — Deploy the Next app to Vercel

1. Vercel → **Add New → Project** → import `etinosa15/C--attempt`.
2. **Root Directory: `web`** (critical — the Next app is in the subfolder, not the
   repo root). Framework preset auto-detects as **Next.js**; leave build/output at
   the defaults (`next build`).
3. **Environment Variables** (Production) — add:

   | Name | Value | Notes |
   |------|-------|-------|
   | `NEXT_PUBLIC_SUPABASE_URL` | from Step 1 | public |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | from Step 1 | public |
   | `SUPABASE_SERVICE_ROLE_KEY` | from Step 1 | **secret** |
   | `FORGE_STUDIO_ORIGINS` | `https://forge-code-academy.onrender.com` | studio's Render origin; CORS allowlist |
   | `NEXT_PUBLIC_LEGACY_APP_URL` | `https://forge-code-academy.onrender.com` | "Open the studio" link target |
   | `NEXT_PUBLIC_POSTHOG_KEY` | from PostHog (or blank) | analytics; blank disables |
   | `NEXT_PUBLIC_POSTHOG_HOST` | `https://us.i.posthog.com` | default region |

4. **Deploy.** Note the **Production URL** Vercel assigns. If it is not literally
   `https://forge-app.vercel.app`, that real value is what goes everywhere this
   runbook writes `forge-app.vercel.app` (Step 3 URL config, Step 5, `render.yaml`).

> `.env.local` in `web/` is for local dev only and is gitignored — Vercel reads
> the dashboard values above, not that file. Never commit real keys.

## Step 5 — Wire the two-origin handshake

The studio and the app are on different origins, so each must name the other:

- **On Vercel** (already done in Step 4): `FORGE_STUDIO_ORIGINS` = the studio's
  Render origin, so CORS lets the studio read authenticated responses.
- **In `render.yaml`** (this repo): the studio build must point at the Vercel app.
  Replace the **three** placeholders `https://forge-app.vercel.app` with the real
  production URL from Step 4:
  1. the `FORGE_SYNC_ORIGIN` env var, and
  2. the `connect-src` in the **three** app-CSP header entries (`/`, `/index.html`,
     `/404.html`).

  If the real URL matches the placeholder exactly, no edit is needed. Commit any
  change to `render.yaml` before the Render deploy picks it up.

> Prod origins must be **https** only. Never ship the `http://localhost` test
> values from `web/.env.local` into `render.yaml` or `deployment.js`.

## Step 6 — Deploy / redeploy the studio on Render

With `render.yaml` pointing at the Vercel app, trigger a Render deploy of
`forge-code-academy` (push to `main`, or **Manual Deploy** in the Render
dashboard). The build writes `FORGE_SYNC_ORIGIN` into `dist/deployment.js`, so the
hosted studio now shows the account UI and calls the Vercel sync bridge.

## Step 7 — Parity smoke test

From the **hosted studio** (`forge-code-academy.onrender.com`), signed out:

1. **Signup** with a fresh email → expect the "check your email to confirm, then
   sign in" message (pending, no session). Confirm via the email link (lands on the
   Vercel app's `/auth/confirm`).
2. **Login** with that account in the studio → progress on the device adopts up
   (max/merge, not a doubling), account UI shows signed-in.
3. **Sync across devices:** complete a lesson; open the studio in another
   browser/profile, log in, confirm the completion appears.
4. **Export** from the account panel → downloads the full progress JSON.
5. **Password reset:** "Forgot your password?" → email arrives → link → set a new
   password on the Vercel app's `/update-password` → log in with it.
6. **Delete account:** arms the type-your-email confirm, downloads a backup, then
   deletes → studio drops to signed-out, local coursework kept, and the Supabase
   **Authentication → Users** row is gone.

Also confirm the guards still hold (quick check in the browser Network tab): a
request without `X-Forge-Sync` is `403`; a disallowed `Origin` gets no
`Access-Control-Allow-Origin`.

> Watch the built-in-email rate limit while testing — space out signups/resets, or
> pre-confirm test users via **Authentication → Users → Add user**.

## Step 8 — Retire the legacy sync service

`render.yaml` no longer defines `forge-sync`, so no new deploys of it happen. If an
old `forge-sync` service still exists in the Render dashboard, **suspend or delete
it** now that parity is confirmed. Leave `sync-server.mjs` (and its local
`npm run sync` convenience script) in the repo — it is a test fixture
(`tests/sync-server.test.mjs`, `tests/sync-client.test.mjs`), no longer a deployed
service.

## Step 9 — Verify analytics

If `NEXT_PUBLIC_POSTHOG_KEY` is set, open the Vercel app once and confirm events
land in the PostHog project. Blank key = analytics disabled, which is a valid
launch state.

## Rollback

- **App broken on Vercel:** roll back to the previous deployment in Vercel
  (instant); the studio keeps working local-first while the app is down (signed-in
  learners just can't sync until it returns).
- **Studio cutover wrong:** revert the `render.yaml` change and redeploy Render.
- **Supabase schema issue:** the migration is idempotent; fix and re-run in the SQL
  editor. No destructive drops are in it.

## Appendix A — Upgrading to Resend + a custom domain

This is the deferred full-volume email path. **No code changes** — it is all
Supabase dashboard + DNS. Do it whenever a working card + domain are available:

1. Buy a domain and add it to a **Resend** account; verify it (Resend gives you the
   DNS records: SPF/DKIM, and a return-path CNAME).
2. In Supabase → **Authentication → Emails → SMTP settings**, turn on **custom
   SMTP** and paste Resend's host/port/user/password + a `from` address on your
   verified domain.
3. The built-in rate limit no longer applies; raise the **rate limits** in Supabase
   Auth settings to taste.
4. (Optional) Point a custom domain at the Vercel app; then update **Site URL** +
   redirect allowlist (Step 3), `FORGE_STUDIO_ORIGINS`, `FORGE_SYNC_ORIGIN`, and the
   `connect-src` in `render.yaml` to the new origin.

## Appendix B — Environment variable reference

**Vercel (the `web/` app):**

| Variable | Public? | Purpose |
|----------|---------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | anon key (RLS-protected) |
| `SUPABASE_SERVICE_ROLE_KEY` | **NO — secret** | account deletion only |
| `FORGE_STUDIO_ORIGINS` | no | CORS allowlist = studio origin(s) |
| `NEXT_PUBLIC_LEGACY_APP_URL` | yes | "Open the studio" link |
| `NEXT_PUBLIC_POSTHOG_KEY` | yes | analytics (blank = off) |
| `NEXT_PUBLIC_POSTHOG_HOST` | yes | PostHog region |

**Render (the studio, via `render.yaml`):**

| Variable | Purpose |
|----------|---------|
| `FORGE_SYNC_ORIGIN` | backend origin the studio calls (= Vercel URL) |
| `NODE_VERSION` | build toolchain pin |

Never committed anywhere: the Supabase keys, SMTP creds, PostHog key. `.env*` is
gitignored; the hosts above hold the real values.




