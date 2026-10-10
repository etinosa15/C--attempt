# Phase 2–6 — Monetization go-live runbook

> Companion to [monetization-plan.md](monetization-plan.md) and
> [phase-0-deploy.md](phase-0-deploy.md). This is the exact, ordered procedure to
> take the **code-complete** monetization work live: **Phase 2** (payments +
> entitlements + reverse trial), **Phase 3** (discounts & growth), **Phase 5**
> (leaderboard, streak shields, metered AI tutor) and the **Phase 6** Teams/Edu
> foundation. All of it is already built, tested (`node --test tests/*.test.mjs`)
> and merged to `main`; **none of it does anything until the steps below are
> done** — every surface degrades to an honest "not configured / not live yet"
> state until its env + Paddle objects + migrations exist.
>
> **Builds on Phase 0.** [phase-0-deploy.md](phase-0-deploy.md) already stood up
> Supabase (Auth + Postgres + RLS, migration `0001`) and the Vercel app, **and set
> `SUPABASE_SERVICE_ROLE_KEY`** — which every server-authoritative write here
> (webhook grants, XP recompute, tutor metering) relies on. This runbook adds the
> billing + growth layers on top; it does **not** re-do any of that.

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
| Opt-in XP leaderboard | migration `0005`, `/api/leaderboard` | **Step 1** (works immediately — opt-in, service-role XP recompute) |
| Streak shields (Pro perk) | already live from Phase 5 | nothing — pure entitlement + progress math, no table, no config |
| Metered AI tutor (Pro perk) | migration `0006`, `/api/tutor` | **Step 1** + **Step 4d** (the Anthropic key) |
| Teams / Edu seats + inherited Pro | migration `0007`, `/api/teams` | **Step 1** (foundation only — per-seat billing & invites are later units) |

Each row is **independently activatable** — e.g. you can launch with just the
reverse trial + paid checkout and add discounts/student/tutor later. Partial config is
safe: an unset discount simply never applies, and an unset `ANTHROPIC_API_KEY`
leaves the tutor on its offline heuristic nudge.

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

## Step 1 — Apply the Phase 2–6 migrations

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
- [`0005_phase5_leaderboard.sql`](../web/supabase/migrations/0005_phase5_leaderboard.sql)
  — `leaderboard_entries` (RLS SELECT only — own row always, anyone else's only
  while `opted_in`; **no write policy**, so `xp`/`opted_in` can't be forged from the
  client — the route recomputes XP via the service role).
- [`0006_phase5_tutor_usage.sql`](../web/supabase/migrations/0006_phase5_tutor_usage.sql)
  — `tutor_usage` (per-learner, per-UTC-day hint counter; RLS self-read, no write
  policy) + `bump_tutor_usage()` (`SECURITY DEFINER`, atomic increment via the
  service role). Metering only — the daily limit is env (Step 4d).
- [`0007_phase6_teams.sql`](../web/supabase/migrations/0007_phase6_teams.sql)
  — `teams` + `team_members` (RLS: self-read membership; a team readable by its
  owner/active members via the `is_active_team_member()` `SECURITY DEFINER` check;
  **no write policy** — all team/seat writes are service-role, tied to billing).
  Inert until the billing unit creates a team.

**SQL editor (simplest):** paste each file's full contents into **SQL Editor → New
query → Run**, in order. **CLI:** `supabase db push`.

> `handle_new_user` is re-declared (`create or replace`) by both `0002` and `0003`
> — the **last one applied wins**, and `0003`'s version is the complete one (profile
> + progress + subscription seed + referral attribution). So apply **`0003` after
> `0002`**. `0004`–`0007` don't touch `handle_new_user`, so their order relative to
> it doesn't matter — but keep the numeric order anyway (`0007` references nothing
> earlier, but running them in sequence is the tested path). Re-running `0002` later
> would drop the referral attribution until you re-run `0003`; if in doubt, re-run
> `0003` last.

Verify in **Table Editor**: `subscriptions`, `referral_codes`, `referrals`,
`student_verifications`, `leaderboard_entries`, `tutor_usage`, `teams`,
`team_members` all exist with RLS enabled. Sign up a throwaway account and
confirm it gets a `subscriptions` row with `plan='trial'`, `status='trialing'`,
`trial_ends_at ≈ now + 7 days`.

**At this point the reverse trial, referral attribution, opt-in leaderboard and
streak shields already work** with zero payment config. The AI tutor needs its
Anthropic key (Step 4d); everything paid needs a payment provider — choose one next.

---

## Payment provider — Paystack (Nigeria-first) or Paddle

Forge supports two providers; the app uses **Paystack whenever `PAYSTACK_SECRET_KEY`
is set**, otherwise falls back to **Paddle**. Pick the one that matches your market
— they're an either/or at runtime:

- **Paystack** — a Nigerian/African payment **gateway**. Best for selling mainly to
  Nigerian learners: local cards, bank transfer, USSD, naira settlement. You are the
  seller of record, so **you handle Nigerian VAT (7.5%)** yourself. This is the
  default path → follow **Paystack setup** just below, then skip to Step 4d/Step 6.
- **Paddle** — a global **merchant of record**. Best for selling internationally in
  USD/EUR with tax handled for you → follow **Steps 2–8 (Paddle)** instead.

Everything else here (migrations, AI tutor, teams) is provider-agnostic.

### Paystack setup (recommended for Nigeria)

1. **Create a Paystack account** at <https://dashboard.paystack.com>. **Test mode
   works immediately** — no verification needed to integrate and test. Business KYC +
   a Nigerian settlement bank account are only needed to receive real money (start
   that early; it can take a few days).
2. **API keys** (Settings → API Keys & Webhooks): the **Secret key** (`sk_test_…` /
   `sk_live_…`) → `PAYSTACK_SECRET_KEY` (**secret**); the **Public key** (`pk_…`) →
   `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY`. Test vs live is decided purely by which key you
   use — there's no separate environment flag.
3. **Create the subscription Plans** (dashboard → Plans), amounts in NGN:
   - **Pro Monthly** — interval **monthly** → copy its plan code (`PLN_…`) →
     `PAYSTACK_PLAN_PRO_MONTHLY`.
   - **Pro Annual** — interval **annually** → `PAYSTACK_PLAN_PRO_ANNUAL`.
   Lifetime is **not** a plan — it's a one-time charge whose amount (in **kobo**,
   naira ×100) lives in `PAYSTACK_AMOUNT_LIFETIME`.
4. **Webhook** (Settings → API Keys & Webhooks → Webhook URL):
   `https://<your-vercel-app>/api/webhooks/paystack`. Paystack signs each event with
   **HMAC-SHA512** of the raw body using your secret key; the handler verifies it in
   constant time and is the **only** thing that grants Pro.
5. **Display prices** (naira marketing copy) via `NEXT_PUBLIC_PRICE_*` — set them to
   match your plan amounts. The Balanced tier below is baked in as the default.

#### Suggested launch pricing (Balanced tier)

| Plan | Display env | Shows | Plan amount (kobo) |
|------|-------------|-------|---------------------|
| Monthly | `NEXT_PUBLIC_PRICE_PRO_MONTHLY` | ₦3,500/mo | `350000` |
| Annual | `NEXT_PUBLIC_PRICE_PRO_ANNUAL` | ₦2,000/mo (₦24,000/yr) | `2400000` |
| Lifetime | `PAYSTACK_AMOUNT_LIFETIME` | ₦40,000 once | `4000000` |

> **Fee note:** Paystack charges local cards 1.5% + ₦100, the ₦100 **waived below
> ₦2,500**, capped at ₦2,000. None of these hit the cap.

#### Paystack environment variables

| Variable | Public? | Needed for |
|----------|---------|------------|
| `PAYSTACK_SECRET_KEY` | **secret** | API calls + webhook signature; its presence selects Paystack |
| `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY` | yes | client checkout (inline, optional) |
| `PAYSTACK_PLAN_PRO_MONTHLY` | no | monthly subscription (plan code) |
| `PAYSTACK_PLAN_PRO_ANNUAL` | no | annual subscription (plan code) |
| `PAYSTACK_AMOUNT_LIFETIME` | no | lifetime one-time charge (kobo) |
| `NEXT_PUBLIC_PRICE_PRO_MONTHLY` / `_PRO_ANNUAL` / `_PRO_ANNUAL_NOTE` / `_LIFETIME` | yes | naira price copy (Balanced-tier defaults baked in; optional) |

> **Minimum to sell on Paystack:** `PAYSTACK_SECRET_KEY`, the two `PAYSTACK_PLAN_*`,
> and `PAYSTACK_AMOUNT_LIFETIME`.

#### Paystack smoke test (test mode)

1. **Checkout:** `/pricing` → **Upgrade to Pro** → redirected to Paystack's hosted
   page; pay with a [test card](https://paystack.com/docs/payments/test-payments)
   (`4084 0840 8408 4081`, any future expiry, CVV `408`). You land back on
   `/checkout?…&reference=…` with the confirmation.
2. **Webhook grant:** within seconds the `subscriptions` row flips to `plan='pro'`,
   `status='active'`, `provider='paystack'`; `/learn/account` reads **Forge Pro**.
3. **Lifetime:** repeat via the Lifetime CTA → one-time charge, row has
   `current_period_end=null` (never lapses).
4. **Cancel:** account → **Cancel plan** → **Switch to Free** → the
   `subscription.disable` webhook flips the row to `canceled`.

> **Paystack caveats** (vs Paddle): no regional/PPP auto-pricing (you set naira
> prices and handle Nigerian VAT); no "pause" or init-time retention discount in the
> save-flow; the founding/student **discounts are Paddle-only** for now.

---

## Step 2 — Create the Paddle catalog (products + prices)

> The Steps 2–8 below are the **Paddle** (international merchant-of-record) path. If
> you set up Paystack above, skip to **Step 4d** (AI tutor) and **Step 6** (env) —
> the `PADDLE_*` steps don't apply.

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

**4d — AI tutor (Anthropic key).** Not a Paddle object — the metered Pro tutor needs
a server-side Anthropic key. Set:
- `ANTHROPIC_API_KEY` = your key (**secret**, server-only — it is read in
  [`/api/tutor`](../web/src/app/api/tutor/route.ts) and **never** returned to the
  browser). Unset → the tutor route returns `{ configured: false }` and the UI stays
  on its offline heuristic nudge (no error shown to the learner).
- `TUTOR_DAILY_LIMIT` (optional) = integer hints/learner/day; defaults to `20`. This
  is the cost ceiling that keeps the Anthropic bill bounded and covered by the Pro
  subscription. Set it to `0` (or any non-positive value) as a **kill-switch** —
  the quota resolver denies every request, so you can disable the tutor instantly
  without pulling the key.
- `TUTOR_MODEL` (optional) = Anthropic model id; defaults to
  `claude-haiku-4-5-20251001` (fast + cheap, right for short Socratic hints).

The tutor is **Pro-gated and metered server-side** regardless of what the client
claims: signed-out → 401, non-Pro → 403 (UI falls back to the offline nudge), quota
exhausted → 429, and **only a successfully served hint costs budget** (a failed or
offline hint is free). The prompt builder is the shared, tested
[`tutor/prompt.mjs`](../../tutor/prompt.mjs) whose one job is "coach, never ship the
worked solution."

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
email). Until both `STUDENT_VERIFY_URL` and `STUDENT_DISCOUNT_ID` are set the
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
| `ANTHROPIC_API_KEY` | **secret** | Step 4d | hosted AI tutor (Pro perk) |
| `TUTOR_DAILY_LIMIT` | no | Step 4d | hints/learner/day (default 20; `0` = kill-switch) |
| `TUTOR_MODEL` | no | Step 4d | tutor model (default `claude-haiku-4-5-20251001`) |

Redeploy (Vercel applies env changes on the next deploy). `web/.env.local` is for
local dev only and is gitignored — the dashboard values are what prod reads.

> **Minimum to sell:** `PADDLE_ENV`, `PADDLE_API_KEY`, `PADDLE_WEBHOOK_SECRET`,
> `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN`, and the three `PADDLE_PRICE_*`. Everything else
> is additive and safe to leave unset. The leaderboard and streak shields need
> **nothing beyond their migrations**; the AI tutor needs only `ANTHROPIC_API_KEY`
> on top (it is independent of Paddle entirely).

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
9. **Leaderboard:** `/learn/leaderboard` → opt in with a display name → your row
   appears ranked by XP; a second opted-in account appears too; opt out → you vanish
   from the public board. Confirm the handle shown is never an email.
10. **Streak shields** (Pro): with a one-day gap in activity, a Pro learner's streak
    survives (up to the shield budget) where a Free learner's resets — no new config,
    just confirm the Pro/Free difference.
11. **AI tutor** (if `ANTHROPIC_API_KEY` set): on a failing lesson, a Pro learner's
    **Ask the study buddy** returns a Socratic hint (not the solution) and the
    remaining-hints count decrements; a Free learner sees the offline heuristic nudge
    instead. Exhaust the daily limit → the UI reports hints refresh tomorrow (429).
    Set `TUTOR_DAILY_LIMIT=0` and redeploy → every learner falls back to the offline
    nudge (kill-switch), confirming no uncovered Anthropic spend.

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
- **Migration issue:** all are idempotent with no destructive drops; fix and
  re-run in the SQL editor (re-run `0003` last to keep the full `handle_new_user`;
  `0004`–`0007` are independent of it).
- **AI tutor misbehaving or too costly:** set `TUTOR_DAILY_LIMIT=0` (instant
  kill-switch — every learner drops to the offline nudge) or unset `ANTHROPIC_API_KEY`
  entirely; both are reversible on the next redeploy and lose no learner data.

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
| `ANTHROPIC_API_KEY` | **secret** | hosted AI-tutor completions | tutor route returns `{configured:false}`; UI stays on offline nudge |
| `TUTOR_DAILY_LIMIT` | no | hints/learner/day cap | defaults to 20; `0`/negative disables the tutor (kill-switch) |
| `TUTOR_MODEL` | no | tutor Anthropic model id | defaults to `claude-haiku-4-5-20251001` |

> The leaderboard, streak shields and the Teams/Edu foundation need **no env** —
> only their migrations (`0005`, `0007`) and the Phase 0 `SUPABASE_SERVICE_ROLE_KEY`
> that already backs every service-role write. The AI tutor's `tutor_usage` metering
> (`0006`) likewise needs only the migration; its only env is the Anthropic key above.

## Appendix — still code-TODO after this runbook

These are **not** config — they need code before they do anything, and are called
out so the runbook doesn't over-promise:

- **Referral rewards.** Attribution is recorded; turning it into an actual
  give-a-month/get-a-month credit (a ledger advancing `referrals.status`, then a
  Paddle credit/discount) is unbuilt.
- **Discount abuse caps beyond Paddle's own** (per-account caps, stacking audit) — the
  app enforces single-discount-at-checkout; anything finer is Paddle-side config +
  future code.
- **Teams/Edu billing + invites.** The `teams`/`team_members` tables and the
  seat/entitlement resolvers are live, but **buying/adjusting seats** (Paddle team
  subscription), the **invite flow**, and the **cohort-progress dashboard** are
  unbuilt later units — the plan gates them on "B2C proven," and the billing half
  needs live Paddle. Until the billing unit creates a team (service-role), the tables
  stay empty and the team entitlement wiring is a no-op.

## Appendix — built but not yet runtime-verified

Honest about what's merged-and-tested-as-code but **not** proven end-to-end against a
live runtime (and surfaced in-app as "soon", never over-promised):

- **C# WASM runner** (Phase 4). The in-browser Roslyn runner's TS harness is
  unit-tested, but the .NET WASM runtime blob (`web/dotnet-runner/`) is committed as
  **source, unbuilt** — building it and verifying a real in-browser compile is a
  pending unit. See [`web/dotnet-runner/README.md`](../web/dotnet-runner/README.md).
- **AI-tutor live call** (Phase 5). The route, Pro gate, quota, and prompt builder
  are tested; the actual Anthropic round-trip hasn't been exercised against a real key
  (none available in the build environment). Step 4d + the smoke test above are how
  you verify it on first deploy.
