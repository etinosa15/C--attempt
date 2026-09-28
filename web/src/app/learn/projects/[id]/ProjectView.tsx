"use client";

// One project brief — the React re-shell of the vanilla studio's renderProject
// (public/app.js). A build-it-yourself task the app cannot autograde, so progress
// is the learner's own: milestone checkboxes and a weighted self-assessment rubric,
// both persisted per-project, plus a free-form project note. "Try a starting idea"
// seeds the playground draft for this track and routes there, exactly as the
// vanilla data-project-start handler does.
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useProgress } from "@/lib/progress/useProgress";
import { tracks } from "@/lib/curriculum";
import { rubricScore } from "@/lib/progress/core";
import type { Project } from "@/lib/curriculum";
import styles from "./project.module.css";

const NOTE_DEBOUNCE_MS = 500;

export function ProjectView({ project: p }: { project: Project }) {
  const { state, update } = useProgress();
  const router = useRouter();

  const checks = state.projectChecks[p.id] ?? [];
  const rubricChecked = (state.rubrics[p.id] as number[] | undefined) ?? [];
  const score = p.rubric ? rubricScore(p.rubric, rubricChecked) : null;

  // The project note, debounced and hydrated-until-touched (the shared
  // pristine-mirror pattern used by the notebook scratchpad and lesson notes).
  const noteKey = `project-${p.id}`;
  const [note, setNote] = useState("");
  const touched = useRef(false);
  const noteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (touched.current) return;
    setNote(state.notes[noteKey] ?? "");
  }, [state.notes, noteKey]);

  function onNoteChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const text = e.target.value;
    touched.current = true;
    setNote(text);
    if (noteTimer.current) clearTimeout(noteTimer.current);
    noteTimer.current = setTimeout(() => {
      update((prev) => ({ ...prev, notes: { ...prev.notes, [noteKey]: text } }));
    }, NOTE_DEBOUNCE_MS);
  }

  // Milestone + rubric toggles share the vanilla Set add/delete pattern, written
  // back immutably so the derived score recomputes on the next render.
  function toggleMilestone(index: number) {
    update((prev) => {
      const set = new Set(prev.projectChecks[p.id] ?? []);
      set.has(index) ? set.delete(index) : set.add(index);
      return { ...prev, projectChecks: { ...prev.projectChecks, [p.id]: [...set] } };
    });
  }
  function toggleCriterion(index: number) {
    update((prev) => {
      const set = new Set((prev.rubrics[p.id] as number[] | undefined) ?? []);
      set.has(index) ? set.delete(index) : set.add(index);
      return { ...prev, rubrics: { ...prev.rubrics, [p.id]: [...set] } };
    });
  }

  // Seed this track's playground draft with the project starter, then route there.
  // Confirm before clobbering a draft the learner has already changed.
  function startProject() {
    const key = `play-${p.lang}`;
    const existing = state.drafts[key];
    if (
      existing &&
      existing !== p.starter &&
      !window.confirm(
        `Replace your ${tracks[p.lang].name} playground draft with this project starter?`,
      )
    )
      return;
    update((prev) => ({ ...prev, drafts: { ...prev.drafts, [key]: p.starter } }));
    router.push(`/learn/playground?lang=${p.lang}`);
  }

  return (
    <div className={styles.page}>
      <Link href="/learn/projects" className={styles.back}>
        ← All projects
      </Link>

      <header className={styles.head}>
        <div className={styles.eyebrow}>
          {p.level.toUpperCase()} project · {p.time}
        </div>
        <h1 className={styles.title}>{p.title}</h1>
        <p className={styles.lead}>{p.summary}</p>
      </header>

      <div className={styles.layout}>
        <article className={styles.brief}>
          <h2>The brief</h2>
          <p>{p.brief}</p>
          <div className={styles.skills}>
            {p.skills.map((s) => (
              <span key={s}>{s}</span>
            ))}
          </div>

          <h2>Build it one milestone at a time.</h2>
          <p className={styles.muted}>
            Mark a milestone when you have verified the behavior in your own project.
          </p>
          <div className={styles.milestones}>
            {p.steps.map((s, i) => (
              <label key={i} className={styles.milestone}>
                <input
                  type="checkbox"
                  checked={checks.includes(i)}
                  onChange={() => toggleMilestone(i)}
                />
                <span>
                  <small>MILESTONE {i + 1}</small>
                  {s}
                </span>
              </label>
            ))}
          </div>

          <div className={styles.callout}>
            <span aria-hidden="true">★</span>
            <div>
              <strong>Stretch your skills</strong>
              <p>{p.stretch}</p>
            </div>
          </div>

          <h2>Watch out for</h2>
          <p className={styles.muted}>
            Traps that catch people on this kind of project.
          </p>
          {(p.pitfalls ?? []).map((pit, i) => (
            <div key={i} className={styles.callout}>
              <span aria-hidden="true">⚡</span>
              <div>
                <strong>{pit.trap}</strong>
                <p>{pit.fix}</p>
              </div>
            </div>
          ))}

          <h2>Your project notes</h2>
          <textarea
            className={styles.notes}
            aria-label="Project notes"
            placeholder="Decisions, questions, discoveries…"
            value={note}
            onChange={onNoteChange}
          />
        </article>

        <aside className={styles.aside}>
          <div className={styles.launch}>
            <div className={styles.launchEyebrow}>Your starting point</div>
            <h3>Start small. Keep building.</h3>
            <p>
              Use the playground to test a core rule, then create the full project
              in its own folder.
            </p>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnPrimary}`}
              onClick={startProject}
            >
              Try a starting idea →
            </button>
            <a
              className={styles.guideLink}
              href={p.resources}
              target="_blank"
              rel="noopener noreferrer"
            >
              Read the official guide ↗
            </a>
          </div>

          {p.rubric && score && (
            <div className={styles.rubric}>
              <h3>Before you call it done</h3>
              <p className={styles.muted}>
                Check each criterion you can honestly demonstrate in your finished
                build. Your score is weighted, and this stays on this device.
              </p>
              <div className={styles.criteria}>
                {p.rubric.criteria.map((c, i) => (
                  <label key={i} className={styles.criterion}>
                    <input
                      type="checkbox"
                      checked={rubricChecked.includes(i)}
                      onChange={() => toggleCriterion(i)}
                    />
                    <span>
                      {c.label}
                      <small>{c.weight} pts</small>
                    </span>
                  </label>
                ))}
              </div>
              <div className={styles.rubricScore}>
                <div className={styles.rubricBar}>
                  <span
                    className={score.passed ? styles.barPassed : ""}
                    style={{ width: `${score.percent}%` }}
                  />
                </div>
                <div className={styles.rubricLine}>
                  <strong>{score.percent}%</strong>
                  <span className={score.passed ? styles.pass : styles.keep}>
                    {score.passed
                      ? `Passing — clears the ${score.pass}% bar`
                      : `Keep going — ${score.pass}% to pass`}
                  </span>
                </div>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
