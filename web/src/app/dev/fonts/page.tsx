import styles from "../dev.module.css";

const SCALE: { token: string; px: string; sample: string }[] = [
  { token: "--fs-5", px: "40px", sample: "Display heading" },
  { token: "--fs-4", px: "26px", sample: "Section heading" },
  { token: "--fs-3", px: "18px", sample: "Subheading / lead" },
  { token: "--fs-2", px: "14px", sample: "UI / body default" },
  { token: "--fs-1", px: "12px", sample: "Smallest label (floor)" },
  { token: "--fs-0", px: "13px (new)", sample: "Tiny labels route here, not sub-12px" },
];

export default function DevFonts() {
  const multi = "Learn to code by building, not watching";
  return (
    <>
      <h1 style={{ fontFamily: "var(--display)", margin: "0 0 0.5rem" }}>Fonts & tracking</h1>
      <p className={styles.lead}>
        Keep Clash Display + Satoshi (identity), but fix the heading tracking: Clash&apos;s
        negative letter-spacing collapses word gaps so multi-word headings read as one blob.
      </p>

      <h2 className={styles.secTitle}>Tracking — before vs after</h2>
      <div className={styles.specimen}>
        <p style={{ margin: "0 0 0.3rem", fontSize: "0.72rem", color: "var(--muted)" }}>
          BEFORE · letter-spacing −0.01em, no word-spacing
        </p>
        <h2
          style={{
            fontFamily: "var(--display)",
            fontWeight: 700,
            fontSize: "clamp(2rem, 5vw, 3rem)",
            letterSpacing: "-0.01em",
            lineHeight: 1.05,
            margin: 0,
          }}
        >
          {multi}
        </h2>
      </div>
      <div className={styles.specimen}>
        <p style={{ margin: "0 0 0.3rem", fontSize: "0.72rem", color: "var(--muted)" }}>
          AFTER · letter-spacing 0, word-spacing 0.06em, text-wrap balance
        </p>
        <h2
          style={{
            fontFamily: "var(--display)",
            fontWeight: 700,
            fontSize: "clamp(2rem, 5vw, 3rem)",
            letterSpacing: 0,
            wordSpacing: "0.06em",
            lineHeight: 1.1,
            textWrap: "balance",
            margin: 0,
          }}
        >
          {multi}
        </h2>
      </div>

      <h2 className={styles.secTitle}>Type scale</h2>
      <div className={styles.specimen}>
        {SCALE.map((s) => (
          <div
            key={s.token}
            style={{ display: "flex", alignItems: "baseline", gap: "1rem", padding: "0.4rem 0" }}
          >
            <code style={{ fontFamily: "var(--mono)", color: "var(--muted)", minWidth: "9rem", fontSize: "0.8rem" }}>
              {s.token} · {s.px}
            </code>
            <span style={{ fontSize: `var(${s.token}, 13px)` }}>{s.sample}</span>
          </div>
        ))}
      </div>

      <h2 className={styles.secTitle}>Lesson body measure (17px / 1.7 / ~64ch)</h2>
      <div className={styles.specimen}>
        <p style={{ fontSize: "17px", lineHeight: 1.7, maxWidth: "64ch", margin: 0, textWrap: "pretty" }}>
          A string plus a number in JavaScript concatenates rather than adds, because the
          <code style={{ fontFamily: "var(--mono)" }}> + </code> operator is overloaded: if either
          side is a string, it joins them. So <code style={{ fontFamily: "var(--mono)" }}>&quot;2&quot; + 3</code>
          {" "}becomes <code style={{ fontFamily: "var(--mono)" }}>&quot;23&quot;</code>, not 5. Read the idea, predict
          the output, then run it — that prediction is what makes it stick.
        </p>
      </div>
    </>
  );
}
