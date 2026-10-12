"use client";

import { useState } from "react";
import { glassBlur } from "@/lib/glass";
import styles from "./marketing.module.css";

// The hero's product visual: a tiny "predict the output" card — the whole Forge
// loop in one glance. Click to reveal the answer. Client-only for the reveal;
// renders fine without JS (the button is just inert until hydrated).
export function HeroPreview() {
  const [revealed, setRevealed] = useState(false);
  return (
    <div className={styles.previewCard} style={glassBlur}>
      <div className={styles.pvHead}>
        <span className={styles.pvDot} />
        <span className={styles.pvDot} />
        <span className={styles.pvDot} />
        <span className={styles.pvHeadLabel}>predict the output</span>
      </div>
      <pre className={styles.pvCode}>
        <span className={styles.pvComment}>// what prints?</span>
        {"\n"}
        <span className={styles.pvKeyword}>const</span> x = <span className={styles.pvString}>&quot;2&quot;</span> + 3;
        {"\n"}
        console.log(x);
      </pre>
      <div className={styles.pvPredict}>
        {revealed ? (
          <>
            <span className={styles.pvOut}>Output</span>
            <code className={styles.pvReveal}>&quot;23&quot;</code>
            <span className={styles.pvHint}>string concatenation, not maths</span>
          </>
        ) : (
          <button type="button" className={styles.pvBtn} onClick={() => setRevealed(true)}>
            Reveal output
          </button>
        )}
      </div>
    </div>
  );
}
