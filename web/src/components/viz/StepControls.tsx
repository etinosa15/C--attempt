"use client";

import { Icon } from "@/components/Icon";
import {
  faArrowLeft,
  faArrowRight,
  faPlay,
  faPause,
  faRotateLeft,
} from "@fortawesome/free-solid-svg-icons";
import styles from "./viz.module.css";

type Props = {
  index: number;
  total: number;
  playing: boolean;
  onPrev: () => void;
  onNext: () => void;
  onReset: () => void;
  onTogglePlay: () => void;
  /** Autoplay button hidden under reduced motion (manual stepping only). */
  canPlay: boolean;
};

/** Prev / play-pause / next + "step X of N". Keyboard lives on the parent group. */
export function StepControls({ index, total, playing, onPrev, onNext, onReset, onTogglePlay, canPlay }: Props) {
  const atStart = index <= 0;
  const atEnd = index >= total - 1;
  return (
    <div className={styles.controls}>
      <button type="button" className={styles.ctrlBtn} onClick={onPrev} disabled={atStart} aria-label="Previous step">
        <Icon icon={faArrowLeft} />
      </button>
      {canPlay && (
        <button
          type="button"
          className={styles.ctrlBtn}
          onClick={atEnd ? onReset : onTogglePlay}
          aria-label={atEnd ? "Replay" : playing ? "Pause" : "Play"}
        >
          <Icon icon={atEnd ? faRotateLeft : playing ? faPause : faPlay} />
        </button>
      )}
      <span className={styles.stepCount} aria-hidden="true">
        {index + 1} / {total}
      </span>
      <button type="button" className={styles.ctrlBtn} onClick={onNext} disabled={atEnd} aria-label="Next step">
        <Icon icon={faArrowRight} />
      </button>
    </div>
  );
}
