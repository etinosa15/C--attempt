import styles from "../dev.module.css";

// Live token swatches — bound to the CSS variables, so the dev theme toggle
// recolours them. The hex values themselves live in tokens.css (applied 4A) and
// are machine-verified by scripts/contrast-check.mjs.
const SWATCHES: { role: string; varName: string }[] = [
  { role: "Page", varName: "--bg" },
  { role: "Surface", varName: "--surface" },
  { role: "Raised", varName: "--raised" },
  { role: "Hairline", varName: "--line" },
  { role: "Text", varName: "--text" },
  { role: "Muted", varName: "--muted" },
  { role: "Accent", varName: "--accent" },
  { role: "Accent hover", varName: "--accent-hover" },
  { role: "Link", varName: "--link" },
  { role: "Success", varName: "--success" },
  { role: "Danger", varName: "--danger" },
  { role: "Warn", varName: "--warn" },
];

// Mirrors scripts/contrast-check.mjs output (both themes pass AA).
const CONTRAST: { pair: string; light: string; dark: string }[] = [
  { pair: "body text / page", light: "13.83", dark: "15.40" },
  { pair: "muted text / page", light: "5.40", dark: "8.68" },
  { pair: "accent (eyebrow/link) / page", light: "4.52", dark: "6.15" },
  { pair: "button label / accent fill", light: "4.76", dark: "6.15" },
  { pair: "link / page", light: "5.25", dark: "7.20" },
  { pair: "danger / page", light: "6.21", dark: "7.23" },
];

export default function DevPalette() {
  return (
    <>
      <h1 style={{ fontFamily: "var(--display)", margin: "0 0 0.5rem" }}>Palette</h1>
      <p className={styles.lead}>
        Warm off-white (light) and flat dark brown (dark). Toggle the theme to compare —
        every swatch is bound to a live token. All text/accent pairs are verified against
        WCAG AA by <code>scripts/contrast-check.mjs</code> (no eyeballing).
      </p>

      <div className={styles.swatchGrid}>
        {SWATCHES.map((s) => (
          <div key={s.varName} className={styles.swatch}>
            <div className={styles.swatchFill} style={{ background: `var(${s.varName})` }} />
            <div className={styles.swatchMeta}>
              <b>{s.role}</b>
              <code>{s.varName}</code>
            </div>
          </div>
        ))}
      </div>

      <h2 className={styles.secTitle}>Verified contrast (WCAG AA, 4.5:1 for text)</h2>
      <div>
        {CONTRAST.map((c) => (
          <div key={c.pair} className={styles.pairRow}>
            <span className={styles.pass}>✓</span>
            <span style={{ minWidth: "16rem" }}>{c.pair}</span>
            <span style={{ color: "var(--muted)" }}>
              light {c.light}:1 · dark {c.dark}:1
            </span>
          </div>
        ))}
      </div>
    </>
  );
}
