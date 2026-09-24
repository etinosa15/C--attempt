# Forge Code Academy — Monetization & Product Plan

> Status: proposal / decision document. Nothing here is built yet.
> Author: senior-dev + product research pass, Sept 2026.
> Read the **TL;DR** and **Strategic decisions** first; the rest is depth.

This plan turns Forge from a zero-dependency, local-first reading app into a
monetized learn-to-code product **without throwing away what makes it good**:
the JS Web Worker runner, the loopback .NET compiler (stays isolated), the
spaced-repetition review engine, streaks, and the Ember buddy. Those become the
retention core of a paid product rather than being replaced.

---

## TL;DR — the recommendation in one screen

1. **Yes, migrate the app shell to React (Next.js + TypeScript).** Not for
   fashion — for SEO marketing/lesson pages (organic acquisition), a real
   component model for pricing/checkout/dashboard/paywall UX, and the ecosystem
   for auth, payments, and experimentation. Keep the runner + compiler engines
   as-is behind a clean boundary. This ends the zero-dependency ethos; that is
   the deliberate cost of monetizing.
2. **Pricing model: reverse trial.** New users get full Pro for 7 days, then
   fall back to a capped Free tier (not locked out). Best of freemium reach +
   trial urgency.
3. **Tiers:** Free · Pro (monthly + annual) · Lifetime (launch lever) · Teams/Edu (later).
4. **Payments: Merchant-of-Record** (Paddle or Stripe's MoR product) so global
   sales tax/VAT is never your liability. Not raw Stripe until you outgrow it.
5. **Close the two hard gaps first:** durable Postgres storage + real account
   recovery (email verification & password reset). Everything else depends on them.
6. **C# execution:** move to **client-side WASM (.NET/Blazor)** so paid learners
   can actually *run* C#, with zero server compute and no arbitrary-code abuse
   surface. This is the single biggest build.
7. **Discounts baked in from day one:** annual (~35% off), purchasing-power
   parity (PPP) for global reach, student discount, launch/founding lifetime,
   referral program, and a 30-day money-back guarantee for trust.

---

## Strategic decisions (the big forks)

### D1 — Framework: React/Next.js vs stay vanilla
The current app is a single full-`#app` re-render on every hash change. That is
fine for reading lessons; it fights you the moment you add stateful checkout,
multi-step onboarding, a live billing dashboard, contextual paywalls, and A/B
tests. **Recommendation: Next.js (React) + TypeScript.**

- **Why React over staying vanilla:** component reuse for the ~40 new
  monetization surfaces, the largest hiring pool, and first-class SDKs for every
  payment/auth/analytics vendor below.
- **Why Next specifically:** marketing pages, the pricing page, and each lesson
  landing page need **SSR/SSG for SEO** — organic search is the cheapest
  acquisition channel for a course product. Next gives SSG for those + API routes
  for the backend-for-frontend.
- **What does NOT get rewritten:** the JS runner worker, the spaced-repetition
  scheduler (`public/core.js`), the curriculum data, and the loopback C#
  compiler. Wrap them behind typed modules; port the *UI*, not the *engine*.
- **Alternatives considered:** Preact (lighter, same model — viable if bundle
  size is sacred), SvelteKit (great DX, smaller ecosystem for payments/auth).
  React wins on ecosystem, which is what de-risks a solo-founder monetization build.
- **Honest cost:** this abandons the zero-dependency rule and is a multi-week
  migration. Do it as a *strangler* migration (see Delivery plan), not a big bang.

### D2 — Pricing model: reverse trial
Freemium in edtech gets huge reach but converts ~2–5%; free trials convert far
better (8–25%) but shrink the funnel. A **reverse trial** captures both: every
new account gets **7 days of full Pro**, then downshifts to a permanent capped
Free tier instead of a hard lockout. Learners feel the full product during the
"honeymoon," and the ones who don't convert still stick around, keep a streak,
and re-enter the funnel later.

### D3 — Payments: Merchant-of-Record, not raw Stripe (yet)
The instant you sell to a second country, you owe sales-tax/VAT registration in
each jurisdiction. A **Merchant-of-Record (MoR)** becomes the legal reseller and
takes that entire liability off your books. Fees are higher than raw Stripe
(~5% + 50¢ vs 2.9% + 30¢) but that gap *is* the tax/compliance service.
Recommend **Paddle** or **Stripe's MoR product** (Stripe acquired Lemon Squeezy
in 2024 and shipped Managed Payments). Move to raw Stripe + Stripe Tax only once
volume makes the fee delta material.

### D4 — C# execution in the paid hosted edition
Today hosted C# is read-only (the compiler is loopback-only, by design, and must
stay separate from the internet services). Paid learners will expect to *run* C#.
Two options: (a) a sandboxed server-side compile service — recurring compute cost
+ an arbitrary-code-execution abuse surface needing hard isolation/quotas; or
(b) **client-side .NET WASM (Blazor)** — ships the runtime to the browser, zero
server compute, no abuse surface, preserves the local-first ethos. **Recommend (b).**
It is the biggest single engineering item; decide it before pricing around "run C#."

---

## Target architecture / tech stack

| Layer | Choice | Why |
|---|---|---|
| App shell | Next.js + React + TypeScript | SEO pages, components, ecosystem |
| Styling | Keep the current design tokens; port CSS → CSS Modules or Tailwind | Preserve Ember/brand identity |
| Runner engine | Reuse JS Web Worker runner as-is | No reason to touch it |
| C# execution | .NET WASM (Blazor) client-side | Run C# hosted, no server cost |
| Database | Postgres (managed: Neon / Supabase / Render PG) + Prisma | Durable accounts, entitlements |
| Auth | Evaluate managed (Clerk / Supabase Auth / BetterAuth) vs porting current scrypt store | Managed closes verification/reset gap fast |
| Payments | Paddle or Stripe MoR | Global tax handled |
| Email | Resend or Postmark | Verification, reset, lifecycle drips |
| Analytics/experiments | PostHog | Funnels, feature flags, A/B, session replay |
| Hosting | Render (already there) or Vercel for the Next app | Incremental |

**Auth note:** the existing `sync/auth.mjs` (salted scrypt, constant-time verify,
digest-only sessions) is genuinely good — but it has *no email verification and
no password reset*, which are mandatory for paying users. Fastest path is a
managed auth provider; the principled path is extending the current store with
verification/reset tokens + an email provider. Either is fine; **don't ship paid
without account recovery.**

**Entitlements must be server-enforced.** All gating logic today would live in
shippable JS the user can edit. Add a `subscription`/`entitlement` record on the
account and let the **server** decide what a session token may fetch — never trust
the client to hide paid lessons.

---

## Pricing & packaging

Illustrative USD (validate against your market; these mirror Boot.dev/Codecademy-class positioning):

| Tier | Price | What's in it |
|---|---|---|
| **Free** (post-trial floor) | $0 | First chapter(s) of each track, limited daily lessons, streaks, offline heuristic hints, local progress |
| **Pro Monthly** | ~$25/mo | Entire JS + C# curriculum, run C# (WASM), spaced-repetition review, AI tutor (metered), certificates, cross-device sync |
| **Pro Annual** | ~$180/yr (~40% off, "$15/mo billed yearly") | Same as Pro; the default-selected option |
| **Lifetime** | ~$299 (launch/founding lever) | One-time; caps churn anxiety, funds runway early |
| **Teams / Edu** | per-seat, later | Cohort dashboards, seat management, invoicing |

Design notes:
- **Anchor high:** show Lifetime/Teams so Pro Annual reads as the sensible middle.
- **Default to annual** on the toggle; annual buyers churn less and fund CAC.
- **Frame annual as a monthly-equivalent** ("$15/mo, billed yearly") next to the
  real monthly price so the discount is legible.
- **30-day, no-questions money-back guarantee** (Boot.dev does this) — removes
  purchase risk and is a conversion lever, not just a policy.

---

## Discounts & growth levers

Build these as first-class, not afterthoughts:

- **Annual discount (~35–40%).** The primary lever; improves cash flow and cuts churn.
- **Purchasing-power parity (PPP).** A $25/mo plan is an impulse buy in the US and
  a week's wages elsewhere. Geo-detect and offer a country-adjusted price (e.g.
  40–70% off in lower-income regions). Show it as an auto-applied banner with a
  manual override; guard against VPN abuse by binding the discount to the payment
  country. Massively expands the addressable market for a global coding audience.
- **Student discount.** Verify via SheerID/GitHub Student Pack; ~50% off. Students
  are your core demographic and become full-price alumni.
- **Launch / founding-member deal.** Time-boxed Lifetime or "founding" annual at a
  steep discount to seed early revenue, testimonials, and word-of-mouth.
- **Referral program.** Give-a-month/get-a-month (Dropbox-style two-sided). Cheap
  acquisition; ties into the social/leaderboard mechanics.
- **Win-back & pause.** On cancel, offer *pause* (retain the account/streak) or a
  one-time discount before letting them go (see Cancellation UX).
- **Seasonal / cohort campaigns.** New Year "learn to code" spike, Black Friday.
  Use codes with hard expiry and per-account caps.

Guardrails: every discount needs an expiry, a per-account cap, and abuse limits.
Never stack uncontrolled (e.g. student + PPP + launch = negative margin).

---

## Monetization UX (down to the screens)

### Pricing page
- **Three visible tiers**, "Most Popular" badge on Pro Annual, annual/monthly
  toggle defaulting to annual, high anchor tier on the right.
- Transparent pricing (no "contact us" for self-serve), money-back guarantee
  badge, social proof (learner count, testimonials, "X lessons completed today").
- Feature comparison table with the paid features clearly (but not punitively) marked.

### Paywall placement — value-based, never a blunt wall
Research is consistent: contextual, benefit-framed upgrade moments beat a bare
"Upgrade to Pro" button. Trigger upgrade prompts at **natural friction points**:
- Learner finishes the free chapter and hits the next locked lesson → inline
  "continue this path" card showing exactly what unlocks.
- Free daily-lesson cap reached → "you're on a roll — keep going with Pro."
- Tries to run C# / open the AI tutor / claim a certificate (paid features).
- Trial day 5–6 → in-app "your trial ends in 2 days, keep your streak" nudge.
Each paywall states the *specific* value being unlocked in context, shows the
price with the guarantee, and is one click to checkout.

### Onboarding funnel
Goal-selection on signup ("learn JS / learn C# / get a job") → personalized first
lesson → **first win within minutes** (run code, pass a check) → start the streak
→ reverse-trial Pro unlocked. Activation (first passed lesson) is the metric that
predicts conversion; instrument it.

### Account & billing dashboard
- Current plan, renewal date, "manage/change plan," invoices/receipts download.
- Update payment method; view/redeem referral credit.
- **Data export** (you already have export/import — surface it as GDPR data
  portability; it's also a trust signal).

### Cancellation & dunning (churn defense)
- **Cancellation flow with save offers:** ask the reason → offer pause, a
  downgrade to Free (keep streak/progress), or a one-time discount before
  confirming. Never a dark pattern; always let them actually cancel.
- **Dunning:** on a failed renewal, retry on a schedule + email the learner
  ("update your card to keep your streak"); grace period before downgrade. MoR
  providers handle most of this — wire the webhooks to your entitlement flips.

### Email lifecycle
Verification, password reset, welcome/onboarding drip, trial-ending sequence,
streak-at-risk nudges, win-back after churn, receipt/renewal notices.

---

## Gamification & retention (lean on what exists)

Forge already has **streaks, the Ember buddy, completion celebrations, and a
spaced-repetition review engine** — that is exactly the retention core paid
coding products are built on. Research: gamified curricula raise weekly study
time ~42%, and spaced repetition + gamification produces ~3× retention. Expand it:

- **XP, levels, achievements/badges** on top of the existing completion + review
  data. Concrete progress markers convert "I studied" into a visible identity.
- **Streak mechanics = loss aversion** (Duolingo's strongest lever). Add
  **streak freezes** as a Pro perk / earned reward — a direct retention *and*
  monetization lever.
- **Leaderboards & guilds — opt-in only.** Respect the existing privacy posture
  (theme/buddy prefs are device-local; don't leak learners onto public boards by
  default).
- **AI tutor as a Pro perk**, Socratic (nudge, don't give the answer — the
  pattern you already had in the tutor proxy), metered per-user by entitlement so
  the Anthropic bill is bounded and covered by subscription revenue.
- **Certificates** on track completion (a paid, shareable artifact — you already
  have `certificateSvg`).

---

## Backend, data & security changes

- **Postgres + Prisma.** Port the file-per-record store (its interface was built
  swappable on purpose) to relational tables: `users`, `accounts`, `sessions`,
  `progress`, `subscriptions`, `entitlements`, `referrals`, `discount_codes`,
  `email_tokens`. Keep the CRDT-ish merge logic for multi-device progress.
- **Entitlement service.** Single source of truth for "what can this user do,"
  read server-side on every gated request and fed by payment webhooks.
- **Payment webhooks.** `subscription.created/updated/canceled`, `payment.failed`
  → flip entitlements idempotently (verify webhook signatures; never trust the
  client redirect alone).
- **Keep the three programs separated.** The loopback C# compiler stays isolated;
  WASM execution moves to the client, so no new server-side code-execution surface.
- **Security hardening for real users:** keep the existing rate limiting; add
  account-takeover protections, optional MFA (managed auth gives this free),
  webhook signature verification, and audit logging on billing events.
- **Privacy/legal (revenue changes your obligations):** Terms of Service, Privacy
  Policy, Refund Policy, cookie consent (GDPR/CCPA), data export + deletion
  (right to erasure/portability — you're partway there via export/import). MoR
  offloads most tax/invoicing compliance. Get the policies reviewed before charging.

---

## Analytics & experimentation

- **PostHog** (or similar): funnels (visit → signup → activation → trial →
  paid), retention cohorts, feature flags, A/B tests on pricing/paywall copy,
  session replay for drop-off diagnosis.
- **North-star + guardrail metrics:** activation rate (first passed lesson),
  trial→paid %, D7/D30 retention, MRR, churn, LTV:CAC, refund rate.
- **A/B test the money surfaces first:** pricing page layout, trial length
  (7 vs 14 days), paywall trigger points, annual discount depth.

---

## Delivery plan (strangler migration, incremental)

Each phase ships something usable; no big-bang rewrite.

**Phase 0 — Foundations (unblocks everything).**
Durable Postgres store + email verification + password reset. Do this on the
*current* stack if you want revenue sooner, or fold into Phase 1.

**Phase 1 — Next.js shell + marketing/SEO.**
Stand up Next, port marketing + pricing + auth pages, embed the existing
runner/lessons via a boundary (iframe or ported components). SSG the SEO pages.

**Phase 2 — Payments + entitlements + reverse trial.**
MoR integration, webhooks, entitlement gating, the reverse-trial state machine,
the pricing page + contextual paywalls.

**Phase 3 — Discounts & growth.**
Annual, PPP, student verification, launch/founding deal, referral program,
money-back guarantee, cancellation save-flow + dunning.

**Phase 4 — C# WASM execution.**
Client-side .NET/Blazor runner so Pro learners run C#. Largest engineering item;
schedule independently.

**Phase 5 — Retention & AI.**
XP/levels/badges on the existing streak+review core, streak freezes, opt-in
leaderboards, metered AI tutor, certificates.

**Phase 6 — Teams/Edu.**
Per-seat billing, cohort dashboards, invoicing. Only after B2C is proven.

Analytics/experimentation (PostHog) goes in at Phase 1 and instruments every
phase after.

---

## Risks & open decisions (need your call)

1. **Zero-dependency ethos is over** if we go Next + Postgres + payments. Confirm
   you accept that (you said you don't mind — flagging it explicitly).
2. **Managed auth vs self-hosted** — speed (Clerk) vs control/cost (extend scrypt).
3. **MoR vendor** — Paddle vs Stripe MoR (depends on payout regions, current tax).
4. **C# WASM effort** — sizeable; is "run C# in the browser" a launch feature or
   a fast-follow?
5. **Exact price points & trial length** — validate with your audience; A/B later.
6. **Free-tier generosity** — too generous kills conversion, too thin kills reach.
   Reverse trial hedges this, but the post-trial floor still needs tuning.

---

## Sources

Coding-education pricing & gamification:
- [Boot.dev pricing](https://boot.dev/pricing?modal=settings) · [Boot.dev vs Codecademy (refunds, guarantee)](https://www.boot.dev/blog/education/bootdev-vs-codecademy) · [Scrimba vs Boot.dev](https://scrimba.com/articles/scrimba-vs-bootdev/) · [Codecademy vs freeCodeCamp](https://scrimba.com/articles/codecademy-vs-freecodecamp/)
- [Boot.dev is worth it? (RPG mechanics, pricing)](https://codingphase.com/blog/is-boot-dev-worth-it) · [Gamified backend courses / Boots AI tutor](https://tooldirectory.ai/tools/boot-dev) · [Gamification & study-time uplift](https://techbullion.com/beyond-tutorials-7-best-ways-to-learn-javascript-in-2026/) · [Spaced repetition + gamification = 3× retention](https://elearningindustry.com/the-learning-retention-formula) · [Why Duolingo's streaks work (loss aversion)](https://dev.to/pocket_linguist/why-duolingos-gamification-works-and-when-it-doesnt-1d4)

Pricing model, trials & paywall UX:
- [Freemium vs free trial vs reverse trial (conversion ranges)](https://www.digitalapplied.com/blog/freemium-vs-free-trial-decision-matrix-2026-saas) · [Reverse trial explained](https://www.stackmatix.com/blog/reverse-trial-model-saas) · [Reverse trials (PLG)](https://www.growthunhinged.com/p/your-guide-to-reverse-trials) · [Pricing page psychology](https://www.digitalapplied.com/blog/subscription-pricing-page-psychology-decision-framework-2026)
- [Convert free→paid in edtech](https://oyelabs.com/features-to-convert-free-users-to-paid-in-an-edtech-platform/) · [High-converting paywall design](https://dev.to/paywallpro/how-to-design-a-high-converting-paywall-pla) · [Paywall structural decisions](https://www.airbridge.io/en/blog/paywall-conversion-structural-decisions) · [50+ paywall examples](https://www.eleken.co/blog-posts/paywall-examples) · [SaaS upgrade/paywall patterns](https://www.saasui.design/blog/saas-upgrade-paywall-ux-patterns)

Discounts & PPP:
- [PPP pricing for SaaS](https://fungies.io/purchasing-power-parity-saas-pricing-2026/) · [Parity pricing guide](https://scalemath.com/blog/parity-pricing/) · [SaaS discounting strategy (annual 10–20%+, CAC)](https://www.getmonetizely.com/articles/discounting-strategy) · [9-step discount strategy](https://spendflo.com/resources/saas-discount-strategy)

Payments / Merchant-of-Record:
- [Lemon Squeezy vs Stripe vs Paddle for solo devs](https://dev.to/devtoolpicks/lemon-squeezy-vs-stripe-vs-paddle-which-should-solo-devs-use-in-2026-2jm9) · [Stripe vs Paddle (fees, MoR; Stripe bought Lemon Squeezy)](https://designrevision.com/blog/stripe-vs-paddle) · [MoR landscape 2026](https://alexcloudstar.com/blog/merchant-of-record-indie-saas-2026/) · [Fee breakdown (Stripe 2.9%+30¢, Paddle 5%+50¢, LS 7%+50¢)](https://www.creem.io/blog/honest-payment-fee-breakdown-creem-vs-stripe-paddle-ls) · [Best MoR platforms / who owns tax liability](https://superframeworks.com/articles/best-stripe-alternatives)
