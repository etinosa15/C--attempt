"use client";

// Settings — the React re-shell of the vanilla studio's renderSettings
// (public/app.js), scoped to what belongs on a device-local preferences screen:
// appearance, a daily focus goal (with a read-only meter of today's progress),
// portable backups, and the local runtime status. Account actions live in the top
// bar, one click from every screen (the professional, low-friction standard we hold
// the port to), so they are deliberately NOT duplicated here. The study buddy has
// no mascot in the port yet, so its panel is omitted until one exists.
import { useEffect, useRef, useState } from "react";
import { useProgress } from "@/lib/progress/useProgress";
import { useCsRunner } from "@/lib/runner/useCsRunner";
import { dailyFocus, focusDuration } from "@/lib/progress/focus";
import { downloadProgress, readBackupFile } from "@/lib/progress/backup";
import { freshState } from "@/lib/progress/core";
import { applyThemePref, readThemePref, type ThemePref } from "@/lib/theme";
import type { ForgeState } from "@/lib/progress/state";
import styles from "./settings.module.css";

const THEMES: [ThemePref, string][] = [
  ["light", "Light"],
  ["dark", "Dark"],
  ["system", "System"],
];
const GOALS = [15, 30, 60, 90];

function lastExportLine(lastExport: number): string {
  if (!lastExport)
    return "You have not exported a backup yet. Browser storage can be cleared, so keep a downloaded copy.";
  const when = new Date(lastExport).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  return `Last backup exported ${when}.`;
}

function csRuntimeLabel(available: boolean | null, sdk: string): string {
  if (available === null) return "Checking for the local .NET runner…";
  if (available === false) return "Available in the local edition";
  return `Ready · .NET SDK ${sdk || "installed"}`;
}

export function Settings() {
  const { state, update } = useProgress();
  const cs = useCsRunner();
  const [pref, setPref] = useState<ThemePref>("system");
  const [message, setMessage] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  // The pre-paint boot script already applied the saved theme; read it once for
  // the button state. Theme is device-local and never part of a progress backup.
  useEffect(() => setPref(readThemePref()), []);

  const focus = dailyFocus(state);

  function chooseTheme(next: ThemePref) {
    setPref(next);
    applyThemePref(next);
  }
  function chooseGoal(goal: number) {
    update((prev) => ({ ...prev, goal }));
  }

  function exportProgress() {
    const now = Date.now();
    update((prev) => ({ ...prev, lastExport: now }));
    downloadProgress({ ...state, lastExport: now });
    setMessage("Backup exported. Keep the downloaded file somewhere safe.");
  }
  async function onImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const imported = await readBackupFile(file);
      if (
        !window.confirm(
          "Replace your current progress with this backup? Export your current progress first if you want to keep it.",
        )
      )
        return;
      update(() => imported as unknown as ForgeState);
      setMessage("Progress restored from your backup.");
    } catch (err) {
      setMessage(
        "Could not import: " + (err instanceof Error ? err.message : "invalid file."),
      );
    } finally {
      e.target.value = ""; // allow re-picking the same file later
    }
  }
  function resetProgress() {
    // Safety copy downloads first — mirrors the vanilla reset — then we confirm.
    downloadProgress(state, "forge-progress-before-reset");
    if (
      !window.confirm(
        "Reset all progress on this device? A backup just downloaded. This clears completed lessons, quizzes, notes, drafts, projects, and review schedules. Your appearance choice is unaffected.",
      )
    )
      return;
    update(() => freshState() as unknown as ForgeState);
    setMessage("Progress reset on this device. A backup downloaded first.");
  }

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <div className={styles.eyebrow}>Make this space yours</div>
        <h1 className={styles.title}>A little setup. A steady rhythm.</h1>
        <p className={styles.lead}>
          Your learning stays on this device. Keep a backup when you want to take
          it elsewhere.
        </p>
      </header>

      {message && (
        <p className={styles.notice} role="status" aria-live="polite">
          {message}
        </p>
      )}

      <div className={styles.grid}>
        <section className={styles.panel}>
          <h2>Appearance</h2>
          <p>
            Choose how Forge looks on this device. System follows your operating
            system’s light or dark setting.
          </p>
          <div className={styles.options}>
            {THEMES.map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={`${styles.option} ${pref === value ? styles.optionActive : ""}`}
                aria-pressed={pref === value}
                onClick={() => chooseTheme(value)}
              >
                {label}
              </button>
            ))}
          </div>
          <p className={styles.muted}>
            This preference stays on this device and is never included in a
            progress backup.
          </p>
        </section>

        <section className={styles.panel}>
          <h2>Set your daily intention</h2>
          <p>
            Choose a realistic amount of focused practice. Consistency matters more
            than a heroic first day.
          </p>
          <div className={styles.options}>
            {GOALS.map((goal) => (
              <button
                key={goal}
                type="button"
                className={`${styles.option} ${styles.goalOption} ${state.goal === goal ? styles.optionActive : ""}`}
                aria-pressed={state.goal === goal}
                onClick={() => chooseGoal(goal)}
              >
                {goal}
                <small>min / day</small>
              </button>
            ))}
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
            <p className={focus.achieved ? styles.achieved : styles.muted}>
              {focus.achieved
                ? "Daily goal reached. Every extra minute counts."
                : `${focusDuration(Math.ceil(focus.remainingSeconds))} left to reach your goal.`}
            </p>
          </div>
          <p className={styles.muted}>
            Use the 25-minute timer in the playground. Today resets at local
            midnight; your lifetime total stays intact.
          </p>
        </section>

        <section className={styles.panel}>
          <h2>Your progress, portable</h2>
          <p>
            Back up completed lessons, quiz results, notes, code drafts, project
            milestones, and review schedules.
          </p>
          <div className={styles.actions}>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnPrimary}`}
              onClick={exportProgress}
            >
              Export progress
            </button>
            <button
              type="button"
              className={styles.btn}
              onClick={() => fileRef.current?.click()}
            >
              Import backup
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={onImportFile}
            />
          </div>
          <p className={styles.muted}>{lastExportLine(state.lastExport)}</p>
          <p className={styles.muted}>
            Import replaces current progress. The website and the local edition keep
            <strong> separate</strong> progress — a backup is how work moves between
            them.
          </p>
          <div className={styles.danger}>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnDanger}`}
              onClick={resetProgress}
            >
              Reset all progress
            </button>
            <p className={styles.muted}>
              Clears everything on this device. A backup downloads first, and you
              will be asked to confirm. Your appearance choice is unaffected.
            </p>
          </div>
        </section>

        <section className={styles.panel}>
          <h2>Your local learning studio</h2>
          <dl className={styles.runtime}>
            <dt>JavaScript</dt>
            <dd>Ready · isolated worker</dd>
            <dt>C# compiler</dt>
            <dd>{csRuntimeLabel(cs.available, cs.sdk)}</dd>
            <dt>Account</dt>
            <dd>Optional</dd>
            <dt>Progress storage</dt>
            <dd>This browser</dd>
          </dl>
          <p className={styles.muted}>
            JavaScript runs in your browser. C# compiles with the .NET SDK on your
            computer in the local edition.
          </p>
        </section>

        <section className={styles.panel}>
          <h2>A study rhythm that works</h2>
          <ol className={styles.rhythm}>
            <li>
              <strong>5 minutes</strong> Recall a previous concept before rereading.
            </li>
            <li>
              <strong>10–20 minutes</strong> Read and trace one worked example.
            </li>
            <li>
              <strong>15–30 minutes</strong> Solve a challenge without copying.
            </li>
            <li>
              <strong>5 minutes</strong> Explain what changed in your understanding.
            </li>
          </ol>
          <p className={styles.muted}>
            Lesson timings are estimates. Slow down when a concept deserves another
            pass.
          </p>
        </section>
      </div>
    </div>
  );
}
