// Forge Code Academy — WCAG contrast verifier (Phase 3A).
// Dependency-free Node script. Verifies the proposed token palettes meet WCAG
// AA (4.5:1 for normal text, 3.0:1 for large/bold or UI boundaries) BEFORE the
// values are written into src/app/tokens.css in Phase 4A. Run:
//   node scripts/contrast-check.mjs          (from web/)
//   node web/scripts/contrast-check.mjs      (from repo root)
// Exit code is non-zero if any pair marked `aa: 4.5` fails, so CI/build can gate.

/** Parse #rrggbb (or #rgb) into [r,g,b] 0-255. */
function hex(h) {
  let s = h.replace("#", "").trim();
  if (s.length === 3) s = s.split("").map((c) => c + c).join("");
  return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16));
}

/** WCAG relative luminance of an [r,g,b] colour. */
function luminance([r, g, b]) {
  const lin = [r, g, b].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

/** Contrast ratio between two hex colours (order-independent). */
function ratio(a, b) {
  const la = luminance(hex(a));
  const lb = luminance(hex(b));
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

// Proposed palettes (Phase 3A). These are applied to tokens.css in Phase 4A;
// this script is the record of what was verified by machine, not by eye.
const LIGHT = {
  bg: "#F6F3EE", surface: "#FBF9F5", raised: "#FDFCFA",
  text: "#2A2420", muted: "#6B6259",
  accent: "#B4531E", accentInk: "#FFF8F2",
  link: "#3F6B7D", success: "#3F6B3C", danger: "#A33322", warn: "#8A5A12",
};
const DARK = {
  bg: "#15110D", surface: "#1F1912", raised: "#272119",
  text: "#EDE8E0", muted: "#B8AFA3",
  accent: "#D1803F", accentInk: "#15110D",
  link: "#7FA6B8", success: "#7FB97B", danger: "#E08A7A", warn: "#E0B45A",
};

// Each pair: [label, foreground, background, aaThreshold].
function pairs(p) {
  return [
    ["body text / page", p.text, p.bg, 4.5],
    ["body text / surface", p.text, p.surface, 4.5],
    ["body text / raised", p.text, p.raised, 4.5],
    ["muted text / page", p.muted, p.bg, 4.5],
    ["muted text / surface", p.muted, p.surface, 4.5],
    ["accent (eyebrow/link) / page", p.accent, p.bg, 4.5],
    ["button label / accent fill", p.accentInk, p.accent, 4.5],
    ["link / page", p.link, p.bg, 4.5],
    ["success / page", p.success, p.bg, 4.5],
    ["danger / page", p.danger, p.bg, 4.5],
    ["warn / page", p.warn, p.bg, 4.5],
  ];
}

function report(name, p) {
  console.log(`\n=== ${name} ===`);
  let failed = 0;
  for (const [label, fg, bg, aa] of pairs(p)) {
    const r = ratio(fg, bg);
    const ok = r >= aa;
    if (!ok) failed++;
    const mark = ok ? "PASS" : "FAIL";
    console.log(
      `  ${mark}  ${r.toFixed(2).padStart(5)}:1  (need ${aa})  ${label}  ${fg} on ${bg}`,
    );
  }
  return failed;
}

const failures = report("LIGHT", LIGHT) + report("DARK", DARK);
console.log(
  `\n${failures === 0 ? "All pairs pass WCAG AA." : failures + " pair(s) FAIL — adjust tokens before shipping."}`,
);
process.exit(failures === 0 ? 0 : 1);
