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
| 3 | Password storage & policy | OK/FIX | Hashing is managed by Supabase (bcrypt). 10-char minimum enforced client+server. **FIX:** signup and new-password reject passwords found in Have I Been Pwned (k-anonymity range API: only a 5-char SHA-1 prefix leaves the browser; fails open on network error) via `lib/pwned.ts`. |
| 4 | Reset tokens | OK | Managed by Supabase GoTrue: random, single-use, short expiry, hashed, session-invalidating; change-notification email is a Supabase template (confirm enabled). |
| 5 | Sessions & cookies | OK | `@supabase/ssr` sets HttpOnly + Secure + SameSite cookies; auth tokens are never in `localStorage` (memory `professional-ux-standard`/port design). |
| 6 | CSRF | OK | SameSite cookies + same-origin API; state-changing routes are POST with the session. No cross-site form posts. |
| 7 | OAuth state/PKCE | OK/OWNER | Supabase handles `state` + PKCE. **OWNER:** trim OAuth redirect URIs to the one canonical domain (remove old Render/preview URLs). |
| 8 | Open redirects | FIX | Login now returns to `?next=`; every `next` (login, OAuth `redirectTo`, `/auth/callback`, `/auth/confirm`) goes through `safeNextPath` (same-origin relative paths only; rejects `//`, `/\`, control chars). Covered by `tests/auth-helpers.test.mjs`. |
| 9 | Email verification before sensitive actions | OK | Email confirmation is ON for signup. |
| 10 | Account deletion & export (NDPA) | OK/FIX | `/api/account` DELETE now requires the typed account email and a sign-in within the last 15 minutes (else 403 `reauth`; the UI sends the learner to sign in again). Export at `/api/account/export`. **TODO:** cancel the subscription on delete once payments are live; the legacy `/api/auth/delete` adapter has no re-auth and should be removed when the Render studio is retired. |
<!-- @@SEC_APPEND@@ -->

## Authorization & payments
| # | Item | Status | Note |
|---|---|---|---|
| 11 | Server-side entitlements | OK | `resolveEntitlement` is pure + server-authoritative; the browser only receives capability booleans. Lesson content shipping in the client bundle is logged as an accepted-risk decision in `OWNER_TODO.md` (F). |
| 12 | Paystack webhooks | OK/FIX | Signature verified (HMAC-SHA512, timing-safe). **H1 fixed:** a no-plan `charge.success` now grants Lifetime only when its (signed) amount equals the configured `PAYSTACK_AMOUNT_LIFETIME` — fail closed otherwise. Remaining before go-live (lower sev): upsert + idempotency (M3), out-of-order lifecycle handling (M2), discount parity (M1). |
| 13 | IDOR | OK/FIX | RLS self-scoping verified. **FIX:** `tests/hardening.test.mjs` asserts every API route holding the service-role client authenticates the caller (or verifies a webhook signature), admin deletes key on `user.id`, and every migrated table enables RLS. Live two-user DB tests remain a nice-to-have. |
| 14 | Leaderboard integrity | OK | Server-side XP, self-read-only RLS (migration `0008`), display-name sanitization (strips HTML). Opt-in only, with a "Leave the board" opt-out. |

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
| 20 | Security headers | FIX | HSTS, nosniff, Referrer-Policy, Permissions-Policy, COOP, and now a `Content-Security-Policy` built from env in `web/next.config.ts` (`object-src none`, `base-uri self`, `form-action self`, `frame-ancestors self`; connect limited to self + Supabase + PostHog + HIBP + Paddle). `X-Frame-Options` is `SAMEORIGIN` so the playground's same-origin preview iframe works. Accepted looseness: script `unsafe-inline` (theme boot + Next bootstrap) and `unsafe-eval` (the JS runner worker uses AsyncFunction). Nonce-based CSP is a future step. |
| 21 | Secrets & config | OK | `.env*` gitignored; only `NEXT_PUBLIC_*` values are public; Next disables client source maps in prod by default. Spot-check the built bundle before go-live. |
| 22 | API responses | OK | Next hides stack traces in production; unknown API routes return 404. |
| 23 | Dependencies | TODO/OWNER | `npm audit`: **8 pre-existing high-severity** advisories in transitive deps (`next`, `braces`, `sharp`, `source-map-js`) — none introduced by the UI deps. Lockfile committed. **OWNER:** enable Dependabot; schedule the `next` bump (breaking). |
| 24 | Preview & duplicate deploys | OWNER | Render studio vs Vercel app both live — pick one canonical, `noindex`/protect previews, decommission/redirect Render (`OWNER_TODO.md` C). |
| 25 | Email SPF/DKIM/DMARC | OWNER | DNS records on the sending domain (`OWNER_TODO.md` E). |
| 26 | Logging & monitoring | OWNER | Choose error monitoring + failed-login/webhook alerts; publish `security.txt` (`OWNER_TODO.md` E/F). |
| 27 | Third-party scripts | FIX/OWNER | PostHog (`posthog-js`, bundled, not a CDN script) initialises only with a key and now skips when Do Not Track or Global Privacy Control is on. **OWNER:** list it in the Privacy policy. |

## Deliverable tests (easy-to-break rules)
Present today: generic login error, reset-response parity (Supabase), import-schema + prototype-pollution validation, XSS escaping (display-name sanitization), code-runner timeout — covered by the suite (312 tests), plus `returnTo` validation and the IDOR/RLS guards in `tests/hardening.test.mjs`.

