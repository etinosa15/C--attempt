# Forge Code Academy — UI Polish Master Plan

> Companion to `docs/ui-audit-phase2.md` (the findings) and `docs/ui-references.md`
> (the reference study). This is the plan of **everything after Phase 1**: the
> locked decisions, the remaining phases, how the separate `forge-fix-prompt.md`
> work folds in, and the sequence. Branch: **`ui-polish`**. Checkpoints: stop for
> owner approval after Phases 2 and 3; commit per sub-step in Phase 4.

## Where we are
- **Done & merged to `main`** (pre-polish): auth UX clarity — show/hide password, friendly errors, live length hint, OAuth parity, `role=alert`. (Overlaps `forge-fix-prompt.md` §1A/1B.)
- **Done on `ui-polish`:** Phase 1 reference study (`docs/ui-references.md`), hero + 3 loader concepts (`.ui-audit/concepts.html`), dark-mode direction explored.
- **Phase 2 audit:** in `docs/ui-audit-phase2.md`.

## Locked decisions
- **Dark mode = pure flat**, no gradient/glow. Base brown **`#15110d`** (between Deep `#14120f` and Mid `#15110c`); surfaces step warm `#1f1912` → `#272119`; depth from **1px hairlines** (`rgba(255,248,240,.09/.15)`) + tone steps, not shadows. One accent `#d1803f`.
- **Light mode = warm off-white** (Phase 3A targets): page `#F6F3EE`, surface `#FBF9F5`, raised `#FDFCFA` (never pure `#FFF`), border-subtle `#E6E0D5`, strong `#D3CBBE`, text `#2A2420`, muted `#6B6259` (verify ≥4.5:1), accent `#B4531E`.
- **Glass only on the floating layer** (top bar, Ctrl-K palette, modals/dropdowns, sticky "This session" + timer + hero preview + auth card). Never on lesson text, code/editor, tables, inputs, callouts.
- **Identity preserved:** warm theme, orange accent, Clash Display headings, Satoshi body, soft rounded cards, sidebar. This is polish, not redesign.
- **Motion tokens:** `--dur-fast 140 / --dur-base 220 / --dur-slow 360 / --dur-story 600-900`; `--ease-out cubic-bezier(.22,1,.36,1)`; spring 300/30. Restrained; honor reduced-motion.

<!-- @@PLAN@@ -->
## Phase 3 — tokens & choices (temp `/dev/*` pages, 404 in production) · **stop for approval**
Pages rendered only when `NODE_ENV !== 'production'`, else 404.
- **3A — Palette** (`/dev/palette`): three warm off-white light options on real screens; **verify contrast with a script, not by eye** (muted ≥4.5:1, white-on-accent ≥4.5:1). Dark already locked (flat `#15110d`) — still run the contrast script and raise dark muted/borders to AA. Warm elevation shadows; depth from tone steps.
- **3B — Fonts** (`/dev/fonts`): first fix tracking (display letter-spacing −0.015em→0, word-spacing 0.04–0.08em, `text-wrap:balance` on headings, `pretty` on paragraphs). If Clash still feels cramped, compare 3 display + 2 body candidates in both themes. ≤2 text families + 1 mono, self-hosted via `next/font` with `size-adjust` fallback (no CLS). Scale: h1 `clamp(2.25rem,1.6rem+2.8vw,3.75rem)`, lesson body 17–18px / 1.7 / 62–68ch, UI 14px, min 12px labels. Recommend one.
- **3C — Loaders** (`/dev/loaders`): the 3 concepts (Ember / Anvil / Molten) productionized — SVG + transform/opacity/stroke-dashoffset only, loop 1.6–2.4s, 250ms delay + ≥600ms min, `role=status`/`aria-busy`, reduced-motion → static mark + soft pulse, light+dark, compact button variant. `ldrs` only for tiny inline spinners (Run/Save/Sync). (Prototypes already in `.ui-audit/concepts.html`.)

## Phase 4 — implement (after approvals; commit per sub-step; run lint+typecheck+build+tests each)
- **4A Tokens & type:** apply chosen palette + fonts via CSS variables only. Raise all small text to ≥12–13px at AA. Don't touch body size/line-height/measure.
- **4B Effects (restrained + fallbacks):**
  - *Glass* (top bar, palette, modals/dropdowns, "This session"/Focus/hero-preview/auth cards): `blur(14px) saturate(140%)`, light `rgb(253 251 247/.62)` / dark `rgb(30 22 18/.55)`, 1px border `.35`/`.10`, inset highlight. `@supports not(backdrop-filter)` + `prefers-reduced-transparency` solid fallbacks. **≤4 blurred elements per viewport**; add soft warm glow shapes behind the top area + hero so glass has something to blur. *(Note: dark mode is otherwise flat per the locked decision — the glow shapes live only behind the floating glass layer, not as a page-wide aurora.)*
  - *Liquid glass (subtle):* active sidebar item, primary buttons, mascot bubble, hero card edge — specular gradient-border; SVG `feDisplacementMap` refraction as a Chromium progressive enhancement with flat fallback.
  - *Neumorphism (soft, keep 3:1 boundary, WCAG 1.4.11):* XP/streak chips, theme toggle, 01–04 number badges, timer ring, progress bars. Dual shadows per theme, inset on pressed.
  - *Never on:* editor, output panel, lesson text, inputs, tables, callouts (callouts = flat surface + accent border).
- **4C Layout fixes:** top-bar `scroll-margin-top` on anchors (fixes covered Playground tabs); add **backdrop blur to the sticky top bar** (audit confirmed `backdrop-filter:none` today); sticky "This session" card with step progress; **reposition/auto-hide the flame mascot** so it never overlaps the right column; JS/C# badges → warm tiles (kill the yellow/purple clash); timer → SVG progress ring with `tabular-nums`.
- **4D Icons:** Font Awesome Free only (`@fortawesome/react-fontawesome` + svg-core + free-solid + free-brands; `config.autoAddCss=false`, import the CSS). One consistent set; JS uses the FA brand icon, C# a custom SVG. Remove the old approach (currently Unicode glyphs + ad-hoc SVG — no icon lib installed). Decorative `aria-hidden`, meaningful `aria-label`.
- **4E Landing:** hero glass code-preview "predict the output" card with reveal; soft warm glows; real logo mark; one primary + one secondary CTA; shorten hero paragraph, cap ~56ch. Run `/no-ai-slop` on all UI copy. (Prototype in `.ui-audit/concepts.html`.) Don't touch lesson content.
- **4F Auth (visual):** 48px inputs, border-strong, distinct fill, 2px accent focus ring + offset, (show/hide + live hint + inline errors already done), submit loading state, "Sign in" styled link, "Try without an account" secondary, logo above form, card with border + soft shadow + warm glow behind.
- **4G Motion system:** the motion tokens above via `motion` (`motion/react`); XP/streak count-up, progress/timer animation, review-card flip, staggered 01–04 entrance, hover/press feedback, lesson-complete `canvas-confetti` (short). No looping motion by body text or editor.
- **4H Visualizations (the main upgrade):** one reusable data-driven system (`CodeTracer`, `StepControls` with Space/arrow keys, `TypeBox`, `PipelineDiagram`; `TraceStep` shape per spec); narration in `aria-live`; reduced-motion → manual stepping only. Build first: (1) C# source→execution pipeline, (2) JS `+` two-jobs, (3) C# types-are-a-contract, (4) predict-the-output reveal. Then list other lessons that would benefit (no implementation).

<!-- @@PLAN2@@ -->
## Phase 5 — verify
- `/web-design-guidelines` again; `/seo-audit` on landing + auth only (meta, OG, headings, indexability; no paid data/MCP).
- Re-screenshot every page both themes at 1440×900 and 390×844; diff against `.ui-audit/` baseline.
- Metrics: CLS < 0.1, LCP < 2.5s, no font layout shift, 60fps animations, bundle before/after, **≤4 backdrop-filter per viewport**, a contrast report for every token pair, keyboard nav + visible focus on all new controls.
- Confirm `/dev/*` 404 in production and no dev overlays render (the **"N" dev badge** seen in dev must be gone in prod — verify `devIndicators` in `next.config.ts` and that Render/Vercel start with `next start`, not `next dev`).
- Final report: per-phase changes, what remains, anything declined + why, and the `ui-polish` git log.

## How `forge-fix-prompt.md` folds in (AFTER the UI phases)
That separate prompt has 3 sections; much overlaps work already done. Suggested handling:
- **§1 Minor UX** — auth show/hide + friendly errors + OAuth parity **already shipped**. Remaining §1 items (caps-lock warning, return-to path, logo header on auth, reset-flow parity, email-typo hint, consent text, plus the site-wide list: unique titles/meta, favicon/OG, 404 links, focus-visible everywhere, 44px tap targets, copy buttons on code blocks, "Saved ✓", skeletons/empty/error states, offline banner, error boundary, quiz answer shuffle, "Get Lifetime" button label, etc.) → fold the **UI/presentation ones into Phase 4**, route the rest to a post-polish pass.
- **§2 Product/trust/business** — mostly **owner decisions** (money-story consistency across About/Terms/Refund, "coming later" vs sold features, contact/seller details, legal pages, canonical domain + Render shutdown, checkout end-to-end). → `OWNER_TODO.md`; a few are code (lock-state badges, SEO files, landing proof) and can ride Phase 4/5.
- **§3 Security** — much **already covered/confirmed by the bug audit** (`memory/bug-audit-2026-10`): IDOR/RLS, leaderboard sanitization + server XP, webhook signature, code-runner sandbox, server-side entitlements, generic login error. Remaining (rate-limiting, breached-password check, security headers/CSP, SPF/DKIM/DMARC, `npm audit`, `robots.txt`/`sitemap.xml`) → a dedicated **security pass** producing `SECURITY_NOTES.md`, separate from UI.
- **Net:** `forge-fix-prompt.md` is a post-UI track (presentation bits absorbed into Phase 4). Produce `OWNER_TODO.md` + `SECURITY_NOTES.md` when we start it.

## Sequence & checkpoints
1. **Phase 2** (this) → stop for approval.
2. **Phase 3** (/dev palette, fonts, loaders) → stop for approval.
3. **Phase 4** (4A→4H), commit per sub-step, lint/typecheck/build/tests each.
4. **Phase 5** verify + final report.
5. **forge-fix-prompt.md** track (UI bits already in P4; then OWNER_TODO + security pass).

## Open decisions needed from the owner
- **Fonts (3B):** keep Clash Display + Satoshi, or audition alternates? (Default: keep, just fix tracking.)
- **Light palette (3A):** confirm the `#F6F3EE` warm-off-white family, or want it cooler/warmer.
- **Loader pick (3C):** which of Ember / Anvil / Molten is *the* signature (others can be button/compact variants).
- **Screenshots-to-`.ui-audit/`:** the preview tool shows shots in-chat but can't write PNGs to disk; a full saved baseline needs a `playwright-cli` run — do that in Phase 5, or skip the saved archive.

