"use client";

// The notebook — the React re-shell of the vanilla studio's renderNotebook
// (public/app.js). One free-form scratchpad plus read-only cards for every note
// the learner has written elsewhere (lesson reflections, project notes). This
// screen never edits lesson/project notes — those are owned by their own screens;
// here they're a browsable trail that links back to where they were written.
//
// Note keys: a lesson reflection is stored under the lesson id; a project note
// under "project-<id>" (matching the vanilla key scheme). The scratchpad lives
// under notes.scratchpad. Anything else is shown as a plain "NOTE" with no link.
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useProgress } from "@/lib/progress/useProgress";
import { lessonsById, projects, tracks } from "@/lib/curriculum";
import styles from "./notebook.module.css";

const SCRATCH_DEBOUNCE_MS = 500;
const PREVIEW_CHARS = 240;

// Resolve a note key to where it was written, so a saved card can link back and
// show a meaningful label. Returns null for a stray key (shown as a plain note).
function resolveNote(id: string): { label: string; title: string; href: string } | null {
  const lesson = lessonsById.get(id);
  if (lesson)
    return {
      label: tracks[lesson.lang].name,
      title: lesson.title,
      href: `/learn/lesson/${lesson.id}`,
    };
  if (id.startsWith("project-")) {
    const project = projects.find((p) => `project-${p.id}` === id);
    if (project)
      return {
        label: "Project",
        title: project.title,
        href: `/learn/projects/${project.id}`,
      };
  }
  return null;
}

export function Notebook() {
  const { state, update } = useProgress();

  // The scratchpad, debounced and hydrated-until-touched (same pristine-mirror
  // pattern as the lesson reflection note and the challenge draft).
  const [scratch, setScratch] = useState("");
  const touched = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (touched.current) return;
    setScratch(state.notes.scratchpad ?? "");
  }, [state.notes]);

  function onScratchChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const text = e.target.value;
    touched.current = true;
    setScratch(text);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      update((prev) => ({
        ...prev,
        notes: { ...prev.notes, scratchpad: text },
      }));
    }, SCRATCH_DEBOUNCE_MS);
  }

  const saved = Object.entries(state.notes).filter(
    ([id, note]) => id !== "scratchpad" && note.trim(),
  );

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <div className={styles.eyebrow}>Your words. Your understanding.</div>
        <h1 className={styles.title}>Leave a trail of what you learn.</h1>
        <p className={styles.lead}>
          The explanation you write yourself is often the one you remember.
        </p>
      </header>

      <div className={styles.layout}>
        <section className={styles.scratchPanel}>
          <div className={styles.sectionTitle}>
            <h2>Your scratchpad</h2>
            <span className={styles.pill}>Autosaved</span>
          </div>
          <p className={styles.hint}>Ideas, questions, and things to try next.</p>
          <textarea
            aria-label="Notebook scratchpad"
            className={styles.scratch}
            value={scratch}
            onChange={onScratchChange}
            placeholder="Today I learned…"
          />
        </section>

        <section className={styles.savedList}>
          <div className={styles.sectionTitle}>
            <h2>From your lessons &amp; projects</h2>
            <span className={styles.savedCount}>
              {saved.length} note{saved.length === 1 ? "" : "s"}
            </span>
          </div>
          {saved.length > 0 ? (
            <div className={styles.cards}>
              {saved.map(([id, note]) => {
                const meta = resolveNote(id);
                const preview =
                  note.slice(0, PREVIEW_CHARS) +
                  (note.length > PREVIEW_CHARS ? "…" : "");
                const card = (
                  <>
                    <small>{meta ? meta.label.toUpperCase() : "NOTE"}</small>
                    <h3>{meta ? meta.title : id}</h3>
                    <p>{preview}</p>
                    {meta && (
                      <span className={styles.cardCta}>Continue your thinking →</span>
                    )}
                  </>
                );
                return meta ? (
                  <Link key={id} href={meta.href} className={styles.card}>
                    {card}
                  </Link>
                ) : (
                  <div key={id} className={styles.card} data-static="true">
                    {card}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className={styles.empty}>
              Your lesson notes will appear here.
              <br />A thought worth saving is a thought worth revisiting.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
