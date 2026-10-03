# Phase 2–3 — Monetization go-live runbook

> Companion to [monetization-plan.md](monetization-plan.md) and
> [phase-0-deploy.md](phase-0-deploy.md). This is the exact, ordered procedure to
> take the **code-complete Phase 2 (payments + entitlements + reverse trial)** and
> **Phase 3 (discounts & growth)** work live. All of it is already built, tested
> (`node --test tests/*.test.mjs`) and merged to `main`; **none of it does anything
> until the steps below are done** — every surface degrades to an honest
> "not configured / not live yet" state until its env + Paddle objects exist.
>
> **Builds on Phase 0.** [phase-0-deploy.md](phase-0-deploy.md) already stood up
> Supabase (Auth + Postgres + RLS, migration `0001`) and the Vercel app. This
> runbook adds the billing layer on top; it does **not** re-do any of that.

## What this turns on

| Capability | Code | Activated by |
|------------|------|--------------|
| Reverse trial (7-day Pro on signup) | migration `0002` | **Step 1** (migration only — works with zero Paddle config) |
| Server-authoritative entitlements + gating | already live from Phase 2 | nothing — reads the `subscriptions` row |
| Paid checkout (Pro monthly/annual, Lifetime) | `/api/checkout`, `/api/webhooks/paddle` | **Steps 2–3, 6** |
| Region-aware pricing (PPP via Paddle PricePreview) | `/api/paddle-config`, `PricingTable` | **Steps 2, 6** (same price IDs) |
| Account & billing dashboard + Paddle portal | `/learn/account` | **Steps 2–3, 6** |
| Launch / founding deal | `/api/paddle-config`, `/api/checkout` | **Step 4a** (+ env) |
| Cancellation save-flow + dunning | `/learn/account/cancel`, `/api/billing/*` | **Steps 3, 4b** |
| Referral program | migration `0003`, `/api/referrals` | **Step 1** (works immediately; rewards are still code-TODO, see note) |
| Student verification + discount | migration `0004`, `/api/student`, `/api/webhooks/student` | **Steps 4c, 5, 6** |

Each row is **independently activatable** — e.g. you can launch with just the
reverse trial + paid checkout and add discounts/student later. Partial config is
safe: an unset discount simply never applies.

## Prerequisites

- The **Supabase** project and **Vercel** app from [phase-0-deploy.md](phase-0-deploy.md),
  already live with migration `0001` applied.
- A **Paddle** account (<https://paddle.com>) — this is the **merchant of record**.
  Start in **sandbox** (`sandbox-vendors.paddle.com`) and only switch to production
  at Step 8. Paddle approval for a live account can take a few days — do Steps 2–7
  entirely in sandbox first.
- (Student discount only) a verification provider — **SheerID** or the **GitHub
  Student Developer Pack** — see Step 5. Skippable at launch.

---

## Step 1 — Apply the Phase 2/3 migrations

Run these against the **same Supabase project** from Phase 0, in order, **after**
`0001`. Each is idempotent (`if not exists`, `drop … if exists`).

- [`0002_phase2_subscriptions.sql`](../web/supabase/migrations/0002_phase2_subscriptions.sql)
  — `subscriptions` table (RLS self-read only; service-role writes), and extends
  `handle_new_user` to **seed a 7-day Pro trial** on every new signup. It also
  backfills existing accounts to the Free floor (`status='expired'`).
- [`0003_phase3_referrals.sql`](../web/supabase/migrations/0003_phase3_referrals.sql)
  — `referral_codes` + `referrals`; extends `handle_new_user` again to attribute a
  signup from `raw_user_meta_data.ref_code`.
- [`0004_phase3_student.sql`](../web/supabase/migrations/0004_phase3_student.sql)
  — `student_verifications` (RLS self-read; service-role grants).

**SQL editor (simplest):** paste each file's full contents into **SQL Editor → New
query → Run**, in order. **CLI:** `supabase db push`.

> `handle_new_user` is re-declared (`create or replace`) by both `0002` and `0003`
> — the **last one applied wins**, and `0003`'s version is the complete one (profile
> + progress + subscription seed + referral attribution). So apply **`0003` after
> `0002`**. Re-running `0002` later would drop the referral attribution until you
> re-run `0003`; if in doubt, re-run `0003` last.

Verify in **Table Editor**: `subscriptions`, `referral_codes`, `referrals`,
`student_verifications` all exist with RLS enabled. Sign up a throwaway account and
confirm it gets a `subscriptions` row with `plan='trial'`, `status='trialing'`,
`trial_ends_at ≈ now + 7 days`.

**At this point the reverse trial and referral attribution already work** with zero
Paddle config. Everything else needs Paddle.

---

## Step 2 — Create the Paddle catalog (products + prices)

In the Paddle dashboard (sandbox first), **Catalog → Products**. Create:

1. **Forge Pro** (a subscription product) with **two prices**:
   - **Pro Monthly** — recurring, billing cycle **monthly**, ~**$25/mo**.
   - **Pro Annual** — recurring, billing cycle **yearly**, ~**$180/yr** (shown in-app
     as "$15/mo billed yearly"). Set the real amounts you want to charge; the app
     renders Paddle's own localized totals, never a hardcoded number.
2. **Forge Lifetime** (can be the same product or its own) with a **one-time** price,
   ~**$299**.

Copy each **price ID** (`pri_…`) → these become, respectively:

| Price | Env var |
|-------|---------|
| Pro Monthly | `PADDLE_PRICE_PRO_MONTHLY` |
| Pro Annual | `PADDLE_PRICE_PRO_ANNUAL` |
| Lifetime | `PADDLE_PRICE_LIFETIME` |

Then collect the API credentials:

- **Developer Tools → Authentication → API key** (`pdl_…`) → `PADDLE_API_KEY` (**secret**).
- **Checkout → (client-side) token**, or **Developer Tools → Authentication →
  client-side token** → `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN` (public; opens the overlay
  and powers PricePreview).

> The catalog mapping lives in [`web/src/lib/payments/catalog.ts`](../web/src/lib/payments/catalog.ts):
> `pro:monthly`/`pro:annual` are subscriptions, `lifetime` is one-time. The three
> price-ID env vars are the only link between the plan selection and Paddle.

---

## Step 3 — Create the Paddle webhook

**Developer Tools → Notifications → New destination**:

- **URL:** `https://<your-vercel-app>/api/webhooks/paddle`
- **Events** (at minimum): `subscription.created`, `subscription.activated`,
  `subscription.updated`, `subscription.canceled`, `subscription.paused`,
  `subscription.resumed`, and `transaction.completed` (the last is how **Lifetime**
  grants Pro).
- Copy the destination's **secret key** (`pdl_ntfset_…`) → `PADDLE_WEBHOOK_SECRET`
  (**secret**).

> The handler ([`/api/webhooks/paddle`](../web/src/app/api/webhooks/paddle/route.ts))
> verifies the `Paddle-Signature` header (HMAC-SHA256 of `ts:rawBody`, constant-time
> compare, 5-min replay window) and is the **only** thing that grants Pro — entitlement
> is never granted from the browser or the checkout redirect. It writes the
> `subscriptions` row via the service role, keyed by `custom_data.user_id` (which
> `/api/checkout` stamps on every transaction).

---

## Step 4 — Create the discounts (optional, each independent)

All discounts are **Paddle discount objects** (`dsc_…`, under **Catalog →
Discounts**). The app never computes a discount amount — it applies the Paddle
discount so PricePreview and checkout always agree. **Guardrail:** the app applies
**at most one** discount per checkout (student > launch deal > none — see
[`student.ts` `pickCheckoutDiscount`](../web/src/lib/payments/student.ts)); never
build a stack that goes negative-margin.

**4a — Launch / founding deal.** Create a discount (e.g. % off, with Paddle-side
usage limits/expiry). Set:
- `PADDLE_LAUNCH_DISCOUNT_ID` = the `dsc_…`.
- `FOUNDING_DEADLINE` = ISO date the offer ends (e.g. `2026-11-30T23:59:59Z`). The
  app hides the deal and stops applying it after this, **and** re-checks it
  server-side at checkout, so a stale `?deal=1` link can't resurrect it.
- `FOUNDING_LABEL` / `FOUNDING_HEADLINE` (optional copy; sensible defaults otherwise).

**4b — Retention (save-flow) discount.** A discount offered inside the cancellation
flow. Set `PADDLE_RETENTION_DISCOUNT_ID`. Without it, the save-flow still offers
pause + the honest downgrade, just not a price break.

**4c — Student discount.** A ~50%-off discount for verified students. Set
`STUDENT_DISCOUNT_ID`. Only applies to a learner whose `student_verifications` row
is `verified` and unexpired (Step 5).

---

## Step 5 — Student verification provider (optional)

The app is **provider-agnostic**: it doesn't talk to SheerID/GitHub directly.
Instead:

1. Stand up the provider's hosted verification flow (SheerID program, or a GitHub
   Student Pack check). Put its entry URL in `STUDENT_VERIFY_URL` — the account
   panel links learners there.
2. Write a thin **bridge** (a small serverless function / webhook the provider
   calls on success) that, once the provider confirms a student, POSTs to
   `https://<your-vercel-app>/api/webhooks/student` with:
   - header `Authorization: Bearer <STUDENT_WEBHOOK_SECRET>`
   - body `{ "user_id": "<the learner's auth id>", "provider": "sheerid", "months": 12 }`
3. Set `STUDENT_WEBHOOK_SECRET` (**secret**, a long random string) on both the bridge
   and Vercel. The endpoint compares it in constant time and is **inert (503) until
   it is set**, so it can never grant a discount in an unconfigured environment.

Mapping the provider's user back to the Forge `user_id` is the bridge's job (e.g.
pass the signed-in learner's id into the provider flow as metadata, or match on
email). Until all three of `STUDENT_VERIFY_URL` + `STUDENT_DISCOUNT_ID` are set the
account panel shows nothing (honest hidden state).

---

## Step 6 — Set the environment variables on Vercel

**Vercel → the `web` project → Settings → Environment Variables** (Production). Add
everything you collected. Secrets must **never** be `NEXT_PUBLIC_`:

| Variable | Public? | From | Needed for |
|----------|---------|------|------------|
| `PADDLE_ENV` | no | `sandbox` or `production` | selects API base + Paddle.js env |
| `PADDLE_API_KEY` | **secret** | Step 2 | server→Paddle (checkout, portal, sub actions) |
| `PADDLE_WEBHOOK_SECRET` | **secret** | Step 3 | verify incoming webhooks |
| `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN` | yes | Step 2 | overlay + PricePreview |
| `PADDLE_PRICE_PRO_MONTHLY` | no | Step 2 | monthly checkout + preview |
| `PADDLE_PRICE_PRO_ANNUAL` | no | Step 2 | annual checkout + preview |
| `PADDLE_PRICE_LIFETIME` | no | Step 2 | lifetime checkout + preview |
| `PADDLE_LAUNCH_DISCOUNT_ID` | no | Step 4a | launch deal |
| `FOUNDING_DEADLINE` | no | Step 4a | launch deal expiry |
| `FOUNDING_LABEL` | no | Step 4a | launch banner copy (optional) |
| `FOUNDING_HEADLINE` | no | Step 4a | launch banner copy (optional) |
| `PADDLE_RETENTION_DISCOUNT_ID` | no | Step 4b | save-flow discount |
| `STUDENT_DISCOUNT_ID` | no | Step 4c | student discount |
| `STUDENT_VERIFY_URL` | no | Step 5 | student verify link |
| `STUDENT_WEBHOOK_SECRET` | **secret** | Step 5 | authorize the student grant bridge |

Redeploy (Vercel applies env changes on the next deploy). `web/.env.local` is for
local dev only and is gitignored — the dashboard values are what prod reads.

> **Minimum to sell:** `PADDLE_ENV`, `PADDLE_API_KEY`, `PADDLE_WEBHOOK_SECRET`,
> `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN`, and the three `PADDLE_PRICE_*`. Everything else
> is additive and safe to leave unset.

---

## Step 7 — Sandbox smoke test

With `PADDLE_ENV=sandbox` and sandbox credentials, from the deployed app:

1. **Reverse trial:** sign up fresh → the top-bar pill shows a Pro trial countdown;
   gated lessons/C#/certificates are unlocked.
2. **Checkout:** `/pricing` → **Upgrade to Pro** → the Paddle overlay opens with the
   right price (use a [Paddle sandbox test card](https://developer.paddle.com/concepts/payment-methods/credit-debit-card)).
   Complete it → land back on `/learn`.
3. **Webhook grant:** within a few seconds the `subscriptions` row flips to
   `plan='pro'`, `status='active'`; the account page reads **Forge Pro** with a
   renewal date. (Check **Notifications → logs** in Paddle if not.)
4. **Region pricing:** load `/pricing` through a VPN or a Paddle-simulated locale →
   prices render in the local currency with the "prices shown for …" banner.
5. **Launch deal** (if set): `/pricing` shows the founding banner and the discounted
   totals; checkout applies the discount. After `FOUNDING_DEADLINE` it disappears.
6. **Cancellation save-flow:** account → **Cancel plan** → see pause / discount (if
   set) / downgrade; **Pause** or **Cancel** → Paddle updates → the webhook flips the
   row; dashboard reflects it.
7. **Referral:** account → copy your link → sign up a second account via
   `/signup?ref=<code>` → the first account's `referrals` shows the invite.
8. **Student** (if configured): account → **Verify student status** → provider flow →
   bridge POSTs the grant → account shows "verified, applies at checkout" → checkout
   applies the student discount (and *not* the launch deal — single discount).

> Reward *granting* for referrals (turning an invite into an actual credit/discount)
> is **not yet wired** — the `referrals` row records the attribution, but advancing
> it to a reward is a code-TODO (needs a credit ledger). Launch without promising a
> specific referral reward, or implement that step first.

---

## Step 8 — Go live

1. Repeat **Steps 2–4** in the **production** Paddle dashboard (prices, webhook,
   discounts are separate objects from sandbox and get new IDs).
2. Flip the Vercel env to the production values and set `PADDLE_ENV=production`.
3. Redeploy. Do one real low-value purchase (e.g. the monthly plan) end-to-end, then
   refund it from the Paddle dashboard to confirm the full loop including the
   `subscription.canceled`/refund path.
4. Make sure the **public pricing claims match reality** before announcing (the
   `/refund` 30-day guarantee page is already live from Phase 3 step 1).

---

## Rollback

- **Checkout misbehaving:** unset the three `PADDLE_PRICE_*` (or `PADDLE_API_KEY`) in
  Vercel and redeploy → every payment surface degrades to the honest "payments
  aren't live yet" placeholder; the reverse trial, Free floor, and all local-first
  learning keep working. No data is lost.
- **Bad discount:** unset its `*_DISCOUNT_ID` (or pass `FOUNDING_DEADLINE` in the
  past) → it stops applying immediately on redeploy. Existing subscriptions are
  unaffected.
- **Webhook/signature issue:** fix `PADDLE_WEBHOOK_SECRET`; Paddle retries failed
  deliveries, so grants self-heal once the secret matches. The handler returns 500
  on write failure *on purpose* so Paddle retries.
- **Migration issue:** all three are idempotent with no destructive drops; fix and
  re-run in the SQL editor (re-run `0003` last to keep the full `handle_new_user`).

---

## Appendix — environment variable reference (monetization additions)

These are **in addition** to the Phase 0 Supabase/CORS/analytics vars in
[phase-0-deploy.md Appendix B](phase-0-deploy.md#appendix-b--environment-variable-reference).
Secrets are never `NEXT_PUBLIC_`, never committed (`.env*` is gitignored), and live
only in the Vercel dashboard (and the student bridge, for `STUDENT_WEBHOOK_SECRET`).

| Variable | Public? | Purpose | Unset behavior |
|----------|---------|---------|----------------|
| `PADDLE_ENV` | no | `sandbox`\|`production` | defaults to sandbox |
| `PADDLE_API_KEY` | **secret** | server→Paddle API | payments report "not configured" |
| `PADDLE_WEBHOOK_SECRET` | **secret** | verify webhooks | webhook 503s (no grants) |
| `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN` | yes | Paddle.js overlay + PricePreview | USD fallback pricing, placeholder checkout |
| `PADDLE_PRICE_PRO_MONTHLY` | no | monthly price ID | that plan unsellable |
| `PADDLE_PRICE_PRO_ANNUAL` | no | annual price ID | that plan unsellable |
| `PADDLE_PRICE_LIFETIME` | no | lifetime price ID | that plan unsellable |
| `PADDLE_LAUNCH_DISCOUNT_ID` | no | launch deal discount | no launch deal shown |
| `FOUNDING_DEADLINE` | no | launch deal end (ISO) | no launch deal shown |
| `FOUNDING_LABEL` | no | launch banner label | default copy |
| `FOUNDING_HEADLINE` | no | launch banner headline | default copy |
| `PADDLE_RETENTION_DISCOUNT_ID` | no | save-flow discount | save-flow offers pause+downgrade only |
| `STUDENT_DISCOUNT_ID` | no | student discount | student panel hidden |
| `STUDENT_VERIFY_URL` | no | provider verify flow URL | student panel hidden |
| `STUDENT_WEBHOOK_SECRET` | **secret** | authorize student grants | student webhook 503s |

## Appendix — still code-TODO after this runbook

These are **not** config — they need code before they do anything, and are called
out so the runbook doesn't over-promise:

- **Referral rewards.** Attribution is recorded; turning it into an actual
  give-a-month/get-a-month credit (a ledger advancing `referrals.status`, then a
  Paddle credit/discount) is unbuilt.
- **Discount abuse caps beyond Paddle's own** (per-account caps, stacking audit) — the
  app enforces single-discount-at-checkout; anything finer is Paddle-side config +
  future code.
