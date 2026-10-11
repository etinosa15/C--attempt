# Forge Code Academy — UI Polish Final Report

> Companion to `docs/ui-polish-plan.md` (the plan) and `docs/ui-audit-phase2.md`
> (the findings). Branch **`ui-polish`**. This covers Phases 3 → 5, run straight
> through after the owner approved Phase 2 on 2026-10-11. Polish, not redesign:
> warm light + flat dark-brown themes, orange accent, Clash Display + Satoshi, soft
> rounded cards, sidebar-less top nav — all preserved. UI layer only; no lesson
> content, logic, schema, or persistence was changed.

## Status: complete

| Gate | Result |
|---|---|
| Production build (`npm run build`, incl. prebuild zip) | ✅ compiles, all routes emitted |
| Unit tests (`npm test`) | ✅ 296 / 296 |
| Typecheck (`tsc --noEmit`) | ✅ clean |
| Lint (new files) | ✅ clean (pre-existing repo lint errors untouched — see Notes) |
| WCAG AA contrast (`web/scripts/contrast-check.mjs`) | ✅ every text/accent pair passes, both themes |
| `/dev/*` 404 in production (`next start`) | ✅ `/dev/palette` + `/dev/viz` → 404; `/`, `/login`, `/pricing` → 200 |
| Dark "N" dev badge | Dev-only Next indicator; absent under `next start` (verified prod server) |
| Reduced-motion + reduced-transparency fallbacks | ✅ global + per-component |
| Mobile (390/375) — nav reachable, no horizontal overflow | ✅ drawer works, 0px overflow |

## Phase 3 — tokens, fonts, loaders (dev sandbox, 404 in prod)
- `/dev/palette`, `/dev/fonts`, `/dev/loaders`, `/dev/viz` under a `NODE_ENV`-gated layout.
- `web/scripts/contrast-check.mjs`: dependency-free WCAG verifier; the palette was
  machine-verified **before** being written to tokens.
- Signature loaders productionized as reusable components (`ForgeLoader` ember/anvil/
  molten + inline `Spinner` + `useDelayedLoading`). **Ember** chosen as the signature.

## Phase 4 — implementation (commit per sub-step)
- **4A tokens/type:** applied the verified warm off-white (light) + flat dark-brown
  `#15110d` (dark) palettes; dark accent `#d1803f`; added `--line-strong`, `--fs-0`,
  motion tokens, neumorphism tokens. Fixed heading tracking (0 letter-spacing +
  word-spacing + `text-wrap: balance`). Floored 47 sub-12px font-sizes to 0.75rem.
- **4B effects:** glass on the floating layer (top bar, account menu, Ctrl-K palette)
  via the `--glass-*` tokens the redesign defined but never consumed; reworked the
  page-wide animated aurora into a static, light-only, top-anchored glow (dark = pure
  flat, per the locked decision); specular rim on the primary CTA; neumorphic theme
  toggle + step badges; **global `:focus-visible`** ring; `@supports`/reduced-
  transparency + reduced-motion fallbacks.
- **4C layout:** `scroll-padding-top` so the sticky bar never covers jumped-to
  anchors/tabs; command-palette JS/C# badges → warm tiles; focus timer upgraded to an
  SVG progress ring with `tabular-nums`; "This session" focus card → glass. (Mascot
  reposition: **N/A** — there is no mascot component in the React port; the only fixed
  element is the behind-everything aurora. Audit issue #5 is moot here.)
- **4D icons:** Font Awesome Free **icon data** rendered as inline SVG via a tiny
  `Icon` component (no react-fontawesome, no global CSS injection → SSR-safe, no FOUC);
  a real flame `BrandMark` replaces the CSS-gradient squares in both top bars + footer
  + auth; glyphs on the flagship surfaces (lesson, project, overview, command palette,
  signup hint) converted to FA.
- **4E landing:** two-column hero with a glass "predict the output" preview card
  (reveal interaction); fixed the dead `.grad` bug so the gradient hero word renders;
  tightened the hero copy; scroll-driven entrance for cards.
- **4F auth:** surface card with border + soft shadow + warm focal glow; logo above
  the form; 48px inputs with a distinct recessed fill + border-strong; 2px accent
  focus ring; spinner submit state; "Try without an account" secondary link.
<!-- @@REPORT_APPEND@@ -->
- **4G motion:** XP/streak count-up (`useCountUp`), scroll-driven card entrance,
  animated level bar, lesson-complete `canvas-confetti` burst — all reduced-motion
  safe. Delivered with CSS + small rAF hooks + `canvas-confetti` instead of pulling in
  `motion/react` (see Deviations).
- **4H visualizations (the main upgrade):** one reusable, data-driven, keyboard-
  steppable (←/→/Space), `aria-live`-narrated system — `CodeTracer`, `PipelineDiagram`,
  `TypeBox`, `PredictReveal`, `StepControls`, `useStepper`. Reduced motion → manual
  stepping only. Wired to four real lessons via a **UI-layer registry** (no curriculum
  change): `js-values` (predict), `js-operators` (+ does two jobs), `cs-types` (type is
  a contract), `cs-methods` (source→Roslyn→IL→JIT→run). Showcased at `/dev/viz`.
  Candidate lessons for the next batch are listed in the plan (4H).
- **4I responsiveness rework (final pass):** real mobile nav — a right-side **drawer**
  at ≤640px exposing all 9 learn-nav items, with `aria-expanded`, Esc + backdrop close,
  body-scroll lock, and 44px targets (fixes the audit's vanished-nav gap). Track-card
  colours switched from the off-palette **JS-yellow / C#-purple** to warm `--warn` /
  `--link` tiles on the Overview **and** marketing (the browser-verified issue #10).
  Kept a sign-in path at ≤380px; safe-area inset on the drawer; verified 0px horizontal
  overflow at 375px.

## Phase 5 — verify
See the status table above. Contrast report lives in `web/scripts/contrast-check.mjs`
(run `node scripts/contrast-check.mjs`). Screenshots were captured live (landing both
themes, login, `/dev/viz`, a real lesson with its visualization in dark mode, and the
375px mobile drawer).

## Deviations (and why)
- **Icons:** used Font Awesome **icon data** rendered as inline SVG rather than the
  `react-fontawesome` component + global CSS config. Same icon set, but SSR-safe, no
  React-19 peer risk, no FOUC, lighter. Decorative icons are `aria-hidden`; meaningful
  ones carry labels.
- **Loaders:** a self-hosted CSS/SVG spinner instead of the `ldrs` web-component lib —
  same inline Run/Save/Sync affordance, one fewer client-only dependency.
- **Motion:** CSS + tiny rAF hooks + `canvas-confetti` instead of `motion/react` — the
  animations the plan asked for, without a heavy animation runtime. Scroll entrance
  uses native scroll-driven CSS as progressive enhancement.
- **Glyph sweep (4D):** converted the flagship surfaces; some low-traffic inline status
  glyphs (quiz/challenge/paths pass-fail marks) still use Unicode — the `Icon` system is
  in place to finish them in a quick follow-up.
- **Mascot (4C):** nothing to reposition — the port has no mascot component.

## What remains (separate tracks, not part of this UI work)
- **`forge-fix-prompt.md` track** (post-UI): produce `OWNER_TODO.md` (money story,
  legal/contact, canonical domain, checkout end-to-end) + a security pass →
  `SECURITY_NOTES.md`.
- **`npm audit`:** 8 pre-existing high-severity advisories in transitive deps
  (`next`, `braces`, `sharp`, `source-map-js`) — **none introduced by the UI deps
  added here** (Font Awesome + canvas-confetti were clean). Belongs in the security pass.
- **Bug-audit Batches B/C** (gated on enabling Paystack payments / the AI tutor).
- **Candidate visualizations** for more lessons (listed in the plan, 4H).
- Optional: finish the inline-glyph → FA sweep; add the review-card 3D flip.

## Branch log (`ui-polish`, newest first)
```
3c97a94 Phase 4I: responsive rework — mobile nav drawer, warm track colours, small-screen sign-in
d24612c Phase 4H: reusable visualization system wired to 4 lessons + /dev/viz
65afd63 Phase 4G: motion system — count-up, card entrance, confetti, animated bar
d7e5954 Phase 4F: auth visual polish — card/glow/logo, 48px inputs, spinner, secondary link
8cf3547 Phase 4E: two-column hero + glass predict card, fix dead gradient word
75c9f69 Phase 4D: Font Awesome icon system + real flame brand mark
cff31ef Phase 4C: scroll-padding, warm palette badges, focus timer ring, glass focus card
2ecbcf8 Phase 4B: glass chrome, flat-dark glow, specular CTA, neumorphism, global focus + fallbacks
4682e0a Phase 4A: palette + flat-dark tokens, heading tracking, motion/fs-0 tokens, small-text floor
29daa1b Phase 3: dev sandbox, WCAG contrast script, Forge loader components
157e2e0 Plan: add 4I responsiveness rework
8da6cc8 Phase 2: UI audit
```
Nothing has been pushed (per standing instruction — push on request).

