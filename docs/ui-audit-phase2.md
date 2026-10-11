# Forge Code Academy — UI Audit (Phase 2)

## Scope & method
Read-only review of `web/`. Findings come from reading `tokens.css` (the design
system) + every page/module CSS and the consuming TSX, plus greps for
`backdrop-filter`, `scrollbar`, icon-library imports, `font-size`, and
`letter-spacing`. Line numbers were read from the files. Contrast ratios are
estimates from the token hex values. Nothing was modified. Each row:
**file:line · current · proposed · why**.

## Browser-verified (computed styles, signed-in session)
Captured live via `getComputedStyle` on the running app, to back the code reads:
- **Smallest text is real and pervasive:** leaf elements on the Overview compute to **10.88px (×18), 11.2px, 11.52px** — confirms the ~11px finding (issue #2).
- **No scrollbar theming exists:** no `scrollbar` / `::-webkit-scrollbar` rule in any loaded stylesheet — confirms the unthemed (bright) dark-mode scrollbar (issue #3).
- **Palette clash confirmed visually:** Overview track cards render **JavaScript with a yellow border+badge** and **C# with a purple border+badge** against the orange brand (issue #10).
- **Dev "N" badge is visible in dev** (issue #9) — must be verified gone under a production `next start`.
- **Top bar:** reads see-through in use. Note the nuance below — the blur *is* in the CSS; the transparency is an opacity issue, not a missing-blur issue.

## Meta / stack facts
| Fact | Value |
|---|---|
| Framework | **Next.js 16.3.6** (`web/package.json`) |
| React | **react 19.2.8 / react-dom 19.2.8** |
| Icons | **No icon library installed** (grep: no lucide/@phosphor/@fortawesome/react-icons/@tabler). Icons are Unicode glyphs (`←` `↗` `✓`), CSS-drawn marks (`.brandMark`, `.featureDot`), inline SVG only for the certificate. → Phase 4D installs Font Awesome Free. |
| Font loading | **Self-hosted `@font-face`** in `tokens.css:12–53` (Satoshi, Clash Display, JetBrains Mono; `font-display:swap`). **Not** `next/font` → no automatic preload / `size-adjust` fallback (CLS risk). |
| `backdrop-filter` | **5 standard + 4 `-webkit`**: `marketing.module.css:23`, `learn.module.css:17` (top bar), `:153` (account menu), `:249` (command palette), `:258` (palette `::backdrop`). Within the ≤4-per-viewport budget per surface. |
| Glass tokens | `--glass-*` / `--lglass-*` (`tokens.css:106–118,145–156`) **defined but never consumed** — components hardcode `blur(14/16/20px)`. Phase 4B should consume the tokens. |
| CLS / LCP | **Not measured** — needs a runtime Lighthouse pass on a production build. LCP element on `/` is the hero `<h1>` (`page.tsx:42`); swap-loaded Clash Display is a likely CLS risk. |

<!-- @@AUDIT@@ -->
## Global tokens & type
| file:line | current | proposed | why |
|---|---|---|---|
| `tokens.css:189` | `h1,h2,h3 { letter-spacing:-0.01em }`; no `line-height`/`word-spacing`/`text-wrap` | tracking → `0`; add `word-spacing:0.04–0.08em`, `line-height:1.1`, `text-wrap:balance` | Negative tracking on Clash Display collapses word gaps so multi-word headings read as one blob (issue #1). |
| `tokens.css:93–97` | type scale jumps `--fs-3:18 → --fs-4:26 → --fs-5:40`; no token between 12–14 | add `--fs-0:13px`; route tiny labels through tokens | Modules invented ~15 ad-hoc sub-token sizes → the ~11px scatter (issue #2). |

## Light theme
| file:line | current | proposed | why |
|---|---|---|---|
| `tokens.css:57` | `--bg:#e7ddca` | `#F6F3EE` | Saturated beige reads "dirty"; the surface `--muted` fails AA against it (issue #7). |
| `tokens.css:58–59` | `--surface:#f6f0e4`, `--raised:#efe7d8` | `--surface:#FBF9F5`, `--raised:#FDFCFA` | `--raised` is currently **darker** than `--surface` → inverted elevation. Never pure `#FFF`. |
| `tokens.css:61` | `--muted:#6b655c` ≈ **4.3:1 on `--bg`** | darken to ~`#5c564d` (≥4.6:1) | Normal-size muted text fails WCAG AA on the page bg (confirm with the 3A script). |

## Dark theme
| file:line | current | proposed | why |
|---|---|---|---|
| *(no rule)* | **no scrollbar theming anywhere** | add `scrollbar-color` + `::-webkit-scrollbar` thumb | Nested scrollers show a bright default track on dark (issue #3, browser-verified). |
| borders via `color-mix(currentColor 10–14%…)` | too faint on dark | raise to ~`.18–.22` or use a lifted `--line` | Hairlines near-invisible on dark cards (issue #3). |
| widespread `opacity:0.6–0.72` on secondary text | — | use `--muted` (dark `#b8afa3` ≈ 8:1 is adequate) | The faintness is **opacity-driven**, not `--muted` — swapping to the token is brighter + controllable. |

<!-- @@AUDIT2@@ -->
## Top bar / nav / command palette
| file:line | current | proposed | why |
|---|---|---|---|
| `learn.module.css:17–18` | `.topbar` HAS `backdrop-filter:blur(14px) saturate(1.3)`; bg `color-mix(--bg 82%, transparent)` | **raise bg opacity to ~90–92%, keep the blur** | The blur is present — the owner's "see-through" is the **82% opacity** over the aurora, not a missing blur (refines issue #4). |
| *(no `scroll-margin-top`)* | sticky bar (~73px) covers jumped-to anchors + Playground tabs | add `scroll-margin-top:~4.5rem` to anchor targets | Confirms the "covers tabs/anchors" half of issue #4. |
| `learn.module.css` palette lang badges | `js` yellow `#f2c94c`/`cs` purple `#a06bd6` tints | warm tiles: `js`→`--warn`, `cs`→`--link`, `color-mix(... 16%)` bg | Off-palette vs orange (issue #10). |

## Landing / marketing
| file:line | current | proposed | why |
|---|---|---|---|
| `page.tsx:40–61` | hero is text-only, no product visual | add the glass code-preview "predict the output" card (prototype in `.ui-audit/concepts.html`) | issue #6. |
| `page.tsx:43` + `marketing.module.css:178` | `<span className="grad">` (literal) vs scoped `.heroTitle .grad` | use `styles.grad` or `:global(.grad)` | **Bug:** CSS-module hashing means the gradient word never renders — dead rule. |
| `marketing.module.css` `.btnGhost` border | `color-mix(currentColor 22%, transparent)` | ~`40%` or accent-tinted | Faint secondary-button border (issue #6). |
| `page.tsx` hero + ctaBand | "Create a free account" appears twice + nav CTA | one primary + one secondary; restate once in the band | Duplicate CTA intent (issue #6). |

## Auth pages (show/hide, friendly errors, live hint, OAuth parity already shipped)
| file:line | current | proposed | why |
|---|---|---|---|
| `auth.module.css:17` | `.card { background: color-mix(currentColor 4%, transparent) }` | real `var(--surface)` + soft shadow + warm glow behind | Card blends into the page (issue #8). |
| `auth.module.css:36` | `.input` border `color-mix(currentColor 22%)` | `~38%` or `--line-strong` | Resting border too faint. |
| `auth.module.css:33–34` | `.input` padding `0.6rem 0.7rem` → ~38px | `min-height:48px` | Below the 44–48px target (issue #8). |

<!-- @@AUDIT3@@ -->
## Learn surfaces (overview · lesson · playground · review · projects · notebook · leaderboard · account)
| file:line | current | proposed | why |
|---|---|---|---|
| `learn.module.css` track badges | JS yellow / C# purple border + badge | warm tiles (`--warn` / `--link` at ~16% tint) | Palette clash, browser-verified (issue #10). |
| Overview small labels (`overview.module.css` eyebrows ~`0.68rem`) + widespread `0.7–0.78rem` meta | ~11px, often `opacity`-dimmed | floor at `0.75rem`+ via a token; swap `opacity` for `--muted` | issue #2 (browser-verified 10.88px ×18). |
| mascot float (search components for the Ember/flame fixed element) | overlaps the right column ("This session"/"Up next"/timer) | reposition or auto-hide so it never overlaps content | issue #5 (confirm element in code during 4C). |
| timer card | flat text | SVG progress ring, heavier numerals, `tabular-nums` | 4C upgrade. |
| `playground.module.css` language tabs | sit under the sticky bar on jump | `scroll-margin-top` (see top-bar) | issue #4. |

## Accessibility & focus
| area | current | proposed | why |
|---|---|---|---|
| `:focus-visible` | present on auth/editor/palette; **absent** on marketing nav, learn nav links, account menu items, palette rows, pricing CTAs | add a shared `:focus-visible { outline:2px solid var(--accent); outline-offset:2px }` | Keyboard users get no visible focus on primary nav/CTAs. |
| tap targets | theme toggle ~32px; nav links ~27px tall | ≥44px on touch | Below the standard. |
| motion | only the aurora is reduced-motion-gated | gate progress/level/timer transitions too | `prefers-reduced-motion` completeness. |

## Mobile / responsive
| file:line | current | proposed | why |
|---|---|---|---|
| `learn.module.css:190–200` | `@media (max-width:640px){ .nav{display:none} }` — 9-item nav vanishes, **no hamburger** (browser-verified: only brand + "Get started" remain) | add a drawer/overflow menu exposing the same nav | On phones there's no visible way to reach Paths/Review/Projects/etc. |
| `marketing.module.css:574` | `@media(max-width:380px){ .signIn{display:none} }` | keep a sign-in path on the smallest screens | Strands returning users. |

## Confirmed vs refuted — the 10 known issues
1. **Tracking — CONFIRMED** (`tokens.css:189`, `-0.01em`, no word-spacing/balance).
2. **~11px low-contrast text — CONFIRMED** (browser: 10.88px ×18; smallest source `pricing.module.css` ~`0.66rem`).
3. **Dark faint borders + white scrollbar — CONFIRMED** (no scrollbar CSS exists; borders at 10–14% currentColor; faintness is opacity-driven, not `--muted`).
4. **Sticky bar see-through / covers tabs — REFINED**: blur **is** present (`learn.module.css:17`); see-through is the **82% bg opacity**; "covers tabs" confirmed (no `scroll-margin-top`).
5. **Mascot overlaps right column — CONFIRMED in brief**; locate the element in 4C.
6. **Hero flat / placeholder mark / duplicate CTAs / faint ghost border — CONFIRMED**, plus a **dead `.grad` CSS-module rule** bug.
7. **Light bg too bright/beige — CONFIRMED** (`--bg #e7ddca`; also `--raised` inverted + `--muted` AA fail).
8. **Auth faint borders / card blends — CONFIRMED** (focus ring/show-hide/errors already fixed; card bg 4%, input border 22%, height ~38px remain).
9. **Next "N" dev badge — CONFIRMED visible in dev**; verify `devIndicators` + prod `next start`.
10. **JS/C# badges clash — CONFIRMED** (browser: yellow/purple vs orange).

**Net:** the token layer is solid but components ignore it (spacing, radius, muted-color, buttons hand-rolled per module); the glass/liquid-glass/neumorphism tokens the redesign wants are defined-but-unused; mobile nav is missing; focus-visible + contrast gaps hit the primary nav and CTAs. Highest-leverage: shared Button/Panel primitives, adopt the glass tokens, a real mobile nav, fix `--muted`/light bg, global `:focus-visible`.

