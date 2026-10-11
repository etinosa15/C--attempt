"use client";

import { useState } from "react";
import styles from "./viz.module.css";

type Props = {
  title?: string;
  code: string;
  /** The output that prints. */
  answer: string;
  /** One-line why. */
  explain: string;
};

/**
 * Predict-the-output: show a snippet, let the learner commit to a guess, then
 * reveal the answer and the reason. The whole Forge loop in one widget.
 */
export function PredictReveal({ title, code, answer, explain }: Props) {
  const [revealed, setRevealed] = useState(false);
  const lines = code.replace(/\n$/, "").split("\n");
  return (
    <figure className={styles.predict} role="group" aria-label={title ?? "Predict the output"}>
      {title && <figcaption className={styles.vizTitle}>{title}</figcaption>}
      <pre className={styles.code}>
        {lines.map((text, i) => (
          <span key={i} className={styles.line}>
            <span className={styles.gutter}>{i + 1}</span>
            <span className={styles.lineText}>{text || " "}</span>
          </span>
        ))}
      </pre>
      {revealed ? (
        <p className={styles.caption} aria-live="polite">
          <span className={styles.outLabel}>Output</span>
          <code className={styles.outValue}>{answer}</code>
          <span className={styles.note}>{explain}</span>
        </p>
      ) : (
        <button type="button" className={styles.revealBtn} onClick={() => setRevealed(true)}>
          Reveal output
        </button>
      )}
    </figure>
  );
}
