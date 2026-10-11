"use client";

import { useStepper } from "./useStepper";
import { StepControls } from "./StepControls";
import type { TraceStep } from "./types";
import styles from "./viz.module.css";

type Props = {
  title?: string;
  code: string;
  steps: TraceStep[];
};

/**
 * Steps through a short snippet: highlights the active line, narrates each step
 * (aria-live), and shows any named values. Keyboard: ←/→ or Space to move. Under
 * reduced motion there is no autoplay — the learner steps manually.
 */
export function CodeTracer({ title, code, steps }: Props) {
  const { index, next, prev, reset, playing, togglePlay } = useStepper(steps.length);
  const lines = code.replace(/\n$/, "").split("\n");
  const step = steps[index];
  const canPlay = typeof matchMedia === "undefined" || !matchMedia("(prefers-reduced-motion: reduce)").matches;

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowRight" || e.key === " ") {
      e.preventDefault();
      next();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      prev();
    }
  }

  return (
    <figure
      className={styles.tracer}
      role="group"
      aria-label={title ? `${title} — interactive walkthrough` : "Interactive code walkthrough"}
      tabIndex={0}
      onKeyDown={onKeyDown}
    >
      {title && <figcaption className={styles.vizTitle}>{title}</figcaption>}
      <pre className={styles.code}>
        {lines.map((text, i) => (
          <span key={i} className={`${styles.line} ${step?.line === i + 1 ? styles.lineActive : ""}`}>
            <span className={styles.gutter}>{i + 1}</span>
            <span className={styles.lineText}>{text || " "}</span>
          </span>
        ))}
      </pre>

      {step?.vars && step.vars.length > 0 && (
        <div className={styles.vars}>
          {step.vars.map((v) => (
            <span key={v.name} className={styles.var}>
              <code>{v.name}</code>
              <span className={styles.varVal}>{v.value}</span>
              {v.type && <span className={styles.varType}>{v.type}</span>}
            </span>
          ))}
        </div>
      )}

      <p className={styles.caption} aria-live="polite">
        <strong>{step?.caption}</strong>
        {step?.note && <span className={styles.note}> {step.note}</span>}
      </p>

      <StepControls
        index={index}
        total={steps.length}
        playing={playing}
        onPrev={prev}
        onNext={next}
        onReset={reset}
        onTogglePlay={togglePlay}
        canPlay={canPlay}
      />
    </figure>
  );
}
