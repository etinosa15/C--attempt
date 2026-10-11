# SECURITY_NOTES — triage of `forge-fix-prompt.md` §3 (items 1–27)

> Status legend: **OK** = verified present/sound in code · **FIX** = fixed on the
> `forge-fixes` branch · **TODO** = real gap, code work still needed · **OWNER** =
> needs an account/DNS/business action (see `OWNER_TODO.md`) · **N/A** = not
> applicable to the current product.
>
> Much of this was already verified by the 2026-10-11 deep bug audit (memory
> `bug-audit-2026-10`): RLS self-scoping, webhook signatures, the loopback C#
> sandbox, prototype-pollution guards, XSS escaping and token handling were all
> found sound. Payments-path hardening (items 11–12) is **Batch B**, gated on
> turning Paystack on. Note: the prompt says "Paddle/Vercel"; payments are now
> **Paystack** and the app is launched **free**.

## Authentication & accounts
| # | Item | Status | Note |
|---|---|---|---|
| 1 | Account enumeration vs helpful errors | OK | `friendlyAuthError` returns a generic "email or password is incorrect"; signup shows the neutral "check your email" screen. Reset uses Supabase's neutral response. |
| 2 | Rate limiting & lockout | TODO/OWNER | Supabase GoTrue applies baseline auth rate limits; no app-level per-IP/per-account throttle or Turnstile yet. Add if abuse appears (OWNER: bot-protection choice). |
| 3 | Password storage & policy | OK/TODO | Hashing is managed by Supabase (bcrypt). 10-char minimum enforced client+server. **TODO:** breached-password k-anonymity check (HIBP range API). |
| 4 | Reset tokens | OK | Managed by Supabase GoTrue: random, single-use, short expiry, hashed, session-invalidating; change-notification email is a Supabase template (confirm enabled). |
| 5 | Sessions & cookies | OK | `@supabase/ssr` sets HttpOnly + Secure + SameSite cookies; auth tokens are never in `localStorage` (memory `professional-ux-standard`/port design). |
| 6 | CSRF | OK | SameSite cookies + same-origin API; state-changing routes are POST with the session. No cross-site form posts. |
| 7 | OAuth state/PKCE | OK/OWNER | Supabase handles `state` + PKCE. **OWNER:** trim OAuth redirect URIs to the one canonical domain (remove old Render/preview URLs). |
| 8 | Open redirects | N/A | No `next`/`returnTo` param is honored today (login always routes to `/`). If "return to where you were" is added later, validate same-origin relative paths only. |
| 9 | Email verification before sensitive actions | OK | Email confirmation is ON for signup. |
| 10 | Account deletion & export (NDPA) | OK/TODO | `/api/account` DELETE (deletes auth identity first — Batch A/L4) and `/api/account/export` exist. **TODO:** require re-auth for delete; cancel the subscription on delete once payments are live. |
<!-- @@SEC_APPEND@@ -->

## Authorization & payments
| # | Item | Status | Note |
|---|---|---|---|
| 11 | Server-side entitlements | OK | `resolveEntitlement` is pure + server-authoritative; the browser only receives capability booleans. Lesson content shipping in the client bundle is logged as an accepted-risk decision in `OWNER_TODO.md` (F). |
| 12 | Paystack webhooks | OK/BATCH B | Signature verified (`verifyPaystackSignature`, HMAC-SHA512, timing-safe). **Batch B (do before go-live):** call `/transaction/verify` and check amount/plan before granting (H1); use upsert + idempotency (M3); handle out-of-order lifecycle events (M2). |
| 13 | IDOR | OK/TODO | RLS self-scoping verified across progress/notebook/projects/certificates/account. **TODO:** add explicit "user A can't read/write user B" tests. |
| 14 | Leaderboard integrity | OK/TODO | Server-side XP, self-read-only RLS (migration `0008`), display-name sanitization (strips HTML) — Batch A. **TODO:** per-user opt-out. |

## Input handling & the code runner
| # | Item | Status | Note |
|---|---|---|---|
| 15 | XSS everywhere | OK | Output-escaped; no `innerHTML`/`dangerouslySetInnerHTML` on user content; display names strip `<>`. |
| 16 | Import backup | OK | Strict schema validation + prototype-pollution guards (`__proto__`/`constructor`) verified; imported strings are never rendered as HTML. |
| 17 | Browser code runner (Worker) | OK | Same-origin/Blob worker, run-timeout terminates it (`while(true)` can't hang the tab), output capped; depth-cap added in Batch A. Static-studio worker CSP is `connect-src 'none'`. |
| 18 | Local C# runner | OK | Loopback `127.0.0.1` only, per-session token, Origin/Host allow-list, scoped CORS, working-dir sandbox + timeout, no shell/file endpoints (memory `cs-runner-hosted-local-split`). Consent copy lives on `/local-setup`. |
| 19 | Share/publish isolation | N/A | No public share/publish feature exists. |

## Platform hardening
| # | Item | Status | Note |
|---|---|---|---|
| 20 | Security headers | FIX/TODO | The **Next app had none** — added `Strict-Transport-Security`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `X-Frame-Options: DENY`, COOP in `web/next.config.ts`. **TODO:** a tuned `Content-Security-Policy` (Next's inline bootstrap + Supabase/Paystack/PostHog origins need care) — left out to avoid breaking the app; add with testing. The static studio already ships a full CSP via `render.yaml`. |
| 21 | Secrets & config | OK | `.env*` gitignored; only `NEXT_PUBLIC_*` values are public; Next disables client source maps in prod by default. Spot-check the built bundle before go-live. |
| 22 | API responses | OK | Next hides stack traces in production; unknown API routes return 404. |
| 23 | Dependencies | TODO/OWNER | `npm audit`: **8 pre-existing high-severity** advisories in transitive deps (`next`, `braces`, `sharp`, `source-map-js`) — none introduced by the UI deps. Lockfile committed. **OWNER:** enable Dependabot; schedule the `next` bump (breaking). |
| 24 | Preview & duplicate deploys | OWNER | Render studio vs Vercel app both live — pick one canonical, `noindex`/protect previews, decommission/redirect Render (`OWNER_TODO.md` C). |
| 25 | Email SPF/DKIM/DMARC | OWNER | DNS records on the sending domain (`OWNER_TODO.md` E). |
| 26 | Logging & monitoring | OWNER | Choose error monitoring + failed-login/webhook alerts; publish `security.txt` (`OWNER_TODO.md` E/F). |
| 27 | Third-party scripts | TODO/OWNER | PostHog analytics (`posthog-js`) is the only external script; list it in Privacy, load conditionally, add SRI where feasible. |

## Deliverable tests (easy-to-break rules)
Present today: generic login error, reset-response parity (Supabase), import-schema + prototype-pollution validation, XSS escaping (display-name sanitization), code-runner timeout — covered by the existing suite (296 tests). **Still to add:** explicit IDOR cross-user tests and `returnTo` redirect validation (only once that feature is added).

