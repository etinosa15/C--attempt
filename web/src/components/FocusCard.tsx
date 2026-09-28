"use client";

// The focus card — the React re-shell of the vanilla studio's playground focus
// aside (the 25-minute session countdown plus the daily-goal meter, from
// dailyFocusMarkup + focusButtonLabel in public/app.js). All timing logic lives in
// useFocus; this is purely presentational.
import { useFocus } from "@/lib/progress/useFocus";
import { formatTime, focusDuration } from "@/lib/progress/focus";
import { useProgress } from "@/lib/progress/useProgress";
import styles from "./FocusCard.module.css";

export function FocusCard() {
  const { state } = useProgress();
  const { focus, buttonLabel, announcement, toggle, reset } = useFocus();

  return (
    <div className={styles.card}>
      <div className={styles.eyebrow}>Focus session</div>
      <div className={styles.clock} aria-live="off">
        {formatTime(focus.remaining)}
      </div>
      <div className={styles.actions}>
        <button
          type="button"
          className={`${styles.btn} ${styles.btnPrimary}`}
          onClick={toggle}
        >
          {buttonLabel}
        </button>
        <button type="button" className={styles.btn} onClick={reset}>
          Reset
        </button>
      </div>

      <div className={styles.meter}>
        <div className={styles.meterHead}>
          <strong>Today’s focus</strong>
          <span>
            {focusDuration(focus.seconds)} / {state.goal} min
          </span>
        </div>
        <progress
          className={styles.bar}
          max={100}
          value={focus.percent}
          aria-label="Today's focus goal"
        />
        <p className={focus.achieved ? styles.achieved : styles.status}>
          {focus.achieved
            ? "Daily goal reached. Every extra minute counts."
            : `${focusDuration(Math.ceil(focus.remainingSeconds))} left to reach your goal.`}
        </p>
      </div>

      <p className={styles.lifetime}>
        Lifetime focus · {Math.floor(focus.totalSeconds / 60)} min
      </p>

      <p className={styles.announce} role="status" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}
