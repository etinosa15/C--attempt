# OWNER_TODO — decisions & actions only you can make

> Generated from `forge-fix-prompt.md` (§2 product/trust/business + the decision
> items from §1/§3). These are **not code** — they need a business or legal call,
> an account action, or DNS/host access. Code-fixable items were handled on the
> `forge-fixes` branch; see `SECURITY_NOTES.md` for the security triage.
>
> **Context that changed since the prompt was written:** payments are **Paystack**
> (Nigeria-first), not Paddle; and the app is **launched free** for now because the
> Paystack live account needs an 18+/KYC-verified owner. Items below reflect that.

## A. Money story & claims (copy + legal)
- [x] **Make the money story consistent.** Pricing sells Pro (₦2,000/mo annual, ₦3,500/mo monthly, ₦24,000/yr) and Lifetime (₦40,000), but About/Terms still describe Forge as "free" / "paid plans in the works". Decide the public stance **while payments are off** (recommended: keep "free today, paid plans coming" everywhere and hide/soften price pages until Paystack is live), then align About, Terms, Refund, pricing.
- [x] **Don't sell what doesn't exist.** "Run C# in the browser" and "AI tutor" are shown as "soon" inside paid tiers. Move them to a separate "Coming later" list that is explicitly *not* part of the purchase, or remove them.
- [x] **Lifetime wording.** Replace "every future track and feature" with specific, defensible wording. Needs your (or a lawyer's) sign-off before it goes live.
- [x] **Trial/card policy.** Decide: is a card required for the 7-day trial? Is there any automatic charge? The app currently says "No card required" — confirm that stays true, or update the copy.

## B. Contact, seller & legal pages (needs lawyer review)
- [x] **Support email + business/seller name** shown in the footer and used in Refund/Terms (they currently say "reach out through the project's repository"). Paystack also expects clear seller details.
- [ ] **Privacy policy** must name every processor actually in use: **Supabase** (auth + DB), **Paystack** (payments, when live), **Google/GitHub** (OAuth), **Vercel** (web app host), **Render** (static studio host, until retired), **PostHog** (analytics — `posthog-js` is installed), and the transactional email provider. State what's stored, retention, and how to request export/deletion. Reference **Nigeria's NDPA**.
- [ ] **Terms** must cover subscriptions, renewals, cancellation, the trial, what "Lifetime" means, acceptable use, **age limit**, governing law, and a "Last updated" date. (You are under 18 — set a minimum-age policy and decide how under-18 learners are handled.)
- [ ] (Drafts in docs/legal/, with your sister for review; min age 12) All legal drafts are **"needs lawyer review"** — do not ship invented legal text.

## C. One canonical deployment
- [ ] **Two live surfaces exist:** the old static studio on **Render** (`forge-code-academy`, `dist/`) and the redesigned Next app on **Vercel** (`forge-app-omega-dusky.vercel.app`, `web/`). Pick ONE canonical product domain, 301-redirect the other, and keep a single set of OAuth redirect URIs, webhook URLs and cookies. Add the chosen domain to canonical tags. (Recommended: the Vercel Next app is the real product; retire/redirect the Render studio.)
- [ ] **Decommission or redirect Render** once the Next app is canonical; remove its OAuth redirect URIs from Supabase/Google/GitHub.

## D. Paystack go-live (blocked on 18+/KYC)
- [ ] Complete Paystack KYC with a trusted-adult/18+ account; obtain **live** secret + public keys.
- [ ] Create the live **plan codes** and set env: `PAYSTACK_SECRET_KEY`, `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY`, `PAYSTACK_PLAN_PRO_MONTHLY/_ANNUAL`, `PAYSTACK_AMOUNT_LIFETIME`, and the price `NEXT_PUBLIC_PRICE_*` values.
- [ ] Register the **webhook URL** in the Paystack dashboard and set the signing secret.
- [ ] **Before flipping payments on, land bug-audit Batch B** (see `SECURITY_NOTES.md` items 11–12 and the memory `bug-audit-2026-10`): webhook must call `/transaction/verify` + check amount/plan (H1); fix the null-period "Pro forever" case (H2).
- [ ] Run the end-to-end checkout smoke test (signup → choose plan → Paystack → webhook → plan unlocked → receipt → manage/cancel).

## E. Email & DNS (owner/registrar access)
- [ ] Set **SPF, DKIM, DMARC** for the sending domain so reset/confirmation emails inbox and can't be spoofed.
- [ ] Publish `/.well-known/security.txt` with a security contact (needs the support email from B).

## F. Monitoring & misc decisions
- [ ] Choose an **error-monitoring** service (e.g. Sentry) and an alert for failed-login / webhook-failure spikes.
- [ ] **Offline claim:** the landing says "works offline". There is no service worker in the Next app — either add one (code) or reword the claim (decide which).
- [ ] **Consent on signup:** text vs a required checkbox linking Terms/Privacy — your preference (code can do either).
- [ ] **Accepted risk:** lesson content ships in the client bundle. Decide whether that's acceptable for "paid" lessons or whether paid content must move behind an authenticated API before charging.
