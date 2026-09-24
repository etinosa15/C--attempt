# Phase 0 — Foundations: durable data + real accounts

> Companion to [monetization-plan.md](monetization-plan.md). Forks resolved
> 2026-09-24: **managed auth**, **Paddle** (later phase), **C# WASM = fast-follow**.
> This is the plan for the work everything else depends on. Not built yet.

## Goal & exit criteria

Phase 0 is done when:
1. Accounts + progress live in **durable Postgres** (no more ephemeral loss).
2. Learners can **sign up, verify email, log in, and reset a forgotten password**
   — via a managed provider, so recovery actually exists.
3. **Local-first still holds:** signed-out learners keep working offline with
   `localStorage`; signing in merges local progress up and syncs across devices.
4. Data **export + delete** work (GDPR portability/erasure; you're partway there).
5. No payment/gating code yet — that's Phase 2. Phase 0 only makes accounts real.

## Sequencing decision (recommended)

**Fold Phase 0 into the start of the Next.js migration rather than retrofitting
the old `node:http` sync-server.** Managed auth + Postgres are dramatically easier
inside the Next app (official SDKs, server routes, session middleware) than bolted
onto the vanilla server we're about to replace. Retrofitting the old server would
be throwaway work. So Phase 0 and Phase 1 kick off together: stand up Next +
provider + Postgres, port the progress/merge logic into server routes.

## Provider pick

You chose managed auth. For Phase 0 the strongest fit is **Supabase** because it
bundles **Auth + Postgres + row-level security + storage in one platform** with a
generous free tier — one vendor for both foundations, and the Postgres is a plain
Postgres you're never locked out of.

- **Recommended: Supabase** — Auth (email verify, reset, OAuth, MFA) *and* the
  Postgres DB together. Row-Level Security enforces per-user data access at the DB.
- **Alternative: Clerk + Neon** — Clerk has best-in-class auth UX/components and
  stronger B2B org features (useful for Teams later), paired with Neon Postgres.
  Two vendors instead of one; pick this if auth polish/orgs matter more than
  single-vendor simplicity.

Recommendation stands unless you prefer Clerk's polish — say so and I'll re-plan
around Clerk+Neon. Either way the app code talks to an auth interface, so the
choice is contained.

## Data model (Phase 0 tables)

Keep it minimal now; later phases add `subscriptions`, `entitlements`,
`referrals`, `discount_codes`.

- **`profiles`** — `id` (= provider user id), `email`, `created_at`,
  `display_name`. Auth identity itself lives in the provider.
- **`progress`** — `user_id` (FK), `state` (JSONB — the same shape `core.js`
  already produces), `revision` (int, for the existing merge/conflict logic),
  `updated_at`. One row per user.
- **`progress_events`** *(optional)* — append-only change log if we want audit /
  richer multi-device merge; not required for parity.

RLS: a learner can read/write only their own `progress` row. Device-local prefs
(theme, buddy) **never** go in Postgres — they stay in `localStorage` as today.

## Auth flows (all provider-backed)

- **Sign up:** email + password (and OAuth: GitHub/Google — natural for a dev
  audience). Provider sends the verification email. On first sign-in, create the
  `profiles` row and adopt any local progress (the existing "signing up adopts the
  progress already on this device" behavior — preserve it).
- **Email verification:** provider-hosted; gate nothing harsh on it in Phase 0,
  but require it before Phase 2 paid actions.
- **Login / logout:** provider session (secure, httpOnly). Drops the custom
  scrypt/token store — the provider owns credentials now.
- **Password reset:** provider-hosted reset flow. This is the gap that made paid
  impossible before; it's now closed by the provider.

## Progress migration & local-first

- **Preserve the merge logic.** The current server merges two devices' changes by
  revision rather than overwriting ([sync/store.mjs](../sync/store.mjs),
  [sync/... progress merge in core.js](../public/core.js)). Port that read-modify-
  write-under-lock into the server route that updates the `progress` JSONB row.
- **Offline unchanged.** Signed-out = `localStorage` only, zero network — the
  local-first promise survives. Sign-in triggers a one-time merge of local into
  the server row, then ongoing sync.
- **No data model rewrite.** `state` stays the JSON shape `core.js` emits; it just
  lives in a JSONB column instead of a JSON file.

## Privacy & security

- RLS on every user-owned table; server verifies the session on each write.
- **Export**: reuse the existing export to satisfy data portability.
- **Delete**: account-deletion flow removes the profile + progress + provider
  identity (right to erasure).
- Keep the loopback C# compiler entirely out of this — Phase 0 touches only
  accounts/progress.

## Task checklist (ordered)

1. Scaffold the Next.js + TypeScript app alongside the current one (don't delete
   the vanilla app yet — strangler migration).
2. Create the Supabase project; provision `profiles` + `progress` tables + RLS.
3. Wire provider auth: signup/login/logout/verify/reset + GitHub/Google OAuth.
4. Port the progress read/write/merge into a Next server route backed by the
   `progress` JSONB row; keep revision-based merge.
5. Client sync layer: `localStorage` when signed out; merge-on-sign-in; sync when
   signed in. Preserve device-local theme/buddy prefs.
6. Embed the existing runner + lessons into the Next shell behind a boundary
   (iframe or ported components) so learning still works during migration.
7. Export + delete flows.
8. Point the deployment at the Next app + Supabase; retire the ephemeral
   free-plan sync-server once parity is confirmed.
9. Add PostHog early so activation/retention is measured from day one.

## Out of scope for Phase 0 (later phases)

Paywalls, entitlements, Paddle/billing, reverse-trial state machine, discounts,
C# WASM, XP/badges/leaderboards, AI tutor. Phase 0 only makes accounts durable
and recoverable.

## What I need from you to start building

- **Confirm Supabase** (vs Clerk+Neon). Default is Supabase.
- **Green light to start scaffolding** the Next app + Supabase in this repo, or
  hold at planning. Nothing is built until you say go.
