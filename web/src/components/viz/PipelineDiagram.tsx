"use client";

import { useStepper } from "./useStepper";
import { StepControls } from "./StepControls";
import { Icon } from "@/components/Icon";
import { faAnglesRight } from "@fortawesome/free-solid-svg-icons";
import type { PipelineStage } from "./types";
import styles from "./viz.module.css";

type Props = {
  title?: string;
  stages: PipelineStage[];
};

/**
 * A left-to-right pipeline (e.g. C# source → compile → IL → JIT → run). Paging
 * advances the active stage; its detail is announced via aria-live. Keyboard:
 * ←/→ or Space. Reduced motion → manual only.
 */
export function PipelineDiagram({ title, stages }: Props) {
  const { index, setIndex, next, prev, reset, playing, togglePlay } = useStepper(stages.length);
  const canPlay = typeof matchMedia === "undefined" || !matchMedia("(prefers-reduced-motion: reduce)").matches;
  const active = stages[index];

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
      className={styles.pipeline}
      role="group"
      aria-label={title ? `${title} — pipeline` : "Pipeline"}
      tabIndex={0}
      onKeyDown={onKeyDown}
    >
      {title && <figcaption className={styles.vizTitle}>{title}</figcaption>}
      <ol className={styles.stages}>
        {stages.map((s, i) => (
          <li key={s.label} className={styles.stageItem}>
            <button
              type="button"
              className={`${styles.stage} ${i === index ? styles.stageActive : ""} ${i < index ? styles.stageDone : ""}`}
              onClick={() => setIndex(i)}
              aria-current={i === index ? "step" : undefined}
            >
              {s.label}
            </button>
            {i < stages.length - 1 && (
              <span className={styles.stageArrow} aria-hidden="true">
                <Icon icon={faAnglesRight} />
              </span>
            )}
          </li>
        ))}
      </ol>

      <p className={styles.caption} aria-live="polite">
        <strong>{active?.label}.</strong> <span className={styles.note}>{active?.detail}</span>
      </p>

      <StepControls
        index={index}
        total={stages.length}
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
