"use client";

// The lesson page shell — the React re-shell of the vanilla studio's renderLesson
// (public/app.js). It lays out the four beats and owns the parts that aren't the
// quiz or the challenge: the reading (sections / worked example / trap), the
// reflection note, the completion gate, and prev/next navigation. The two graded
// beats are delegated to <Quiz> and <Challenge>, which record their own progress.
//
// Opening a lesson records it as `lastLesson` so the Overview can offer "resume".
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useProgress } from "@/lib/progress/useProgress";
import {
  dayKey,
  highlight,
  certificateEarned,
} from "@/lib/progress/core";
import { tracks, moduleName, type Lesson } from "@/lib/curriculum";
import { Quiz } from "./Quiz";
import { Challenge } from "./Challenge";
import styles from "./lesson.module.css";

const NOTE_DEBOUNCE_MS = 500;

export function LessonView({ lesson }: { lesson: Lesson }) {
  const { state, update } = useProgress();

  const track = tracks[lesson.lang];
  const list = track.lessons;
  const index = list.findIndex((l) => l.id === lesson.id);
  const prev = index > 0 ? list[index - 1] : undefined;
  const next = index >= 0 && index < list.length - 1 ? list[index + 1] : undefined;

  const done = state.completed.includes(lesson.id);
  const quizPassed = !!state.quizzes[lesson.id];
  const challengeSolved = state.solved.includes(lesson.id);
  const canComplete = quizPassed && challengeSolved;

  // Remember this as the lesson to resume — only write when it actually changes,
  // so revisiting a lesson we're already on doesn't kick off a needless sync.
  useEffect(() => {
    if (state.lastLesson !== lesson.id) {
      update((prev) => ({ ...prev, lastLesson: lesson.id }));
    }
  }, [lesson.id, state.lastLesson, update]);

  function complete() {
    if (!canComplete || done) return;
    update((prev) => {
      const completed = prev.completed.includes(lesson.id)
        ? prev.completed
        : [...prev.completed, lesson.id];
      const trackIds = track.lessons.map((l) => l.id);
      // Stamp the earned date once the track first hits 100%. Existence is
      // otherwise derived from `completed`, so this is just the "first earned"
      // marker the certificate screen reads (epoch-ms, per sanitizeState).
      const justEarned =
        certificateEarned(completed, trackIds) && !prev.certificates[lesson.lang];
      return {
        ...prev,
        completed,
        reviews: {
          ...prev.reviews,
          [lesson.id]: { count: 0, interval: 0, due: Date.now() },
        },
        activity: {
          ...prev.activity,
          [dayKey()]: (Number(prev.activity[dayKey()]) || 0) + 1,
        },
        certificates: justEarned
          ? { ...prev.certificates, [lesson.lang]: Date.now() }
          : prev.certificates,
      };
    });
  }

  const example = highlight(lesson.example, lesson.lang);

  return (
    <div>
      <Link href={`/learn?track=${lesson.lang}`} className={styles.back}>
        ← {track.name} learning path
      </Link>

      <header className={styles.head}>
        <div className={styles.eyebrow}>
          {moduleName(lesson.module).toUpperCase()} · Lesson{" "}
          {String(index + 1).padStart(2, "0")} of {list.length}
        </div>
        <h1 className={styles.title}>{lesson.title}</h1>
        <p className={styles.lead}>{lesson.lead}</p>
        <div className={styles.meta}>
          <span>{track.short}</span>
          <span>{lesson.minutes} min</span>
          {done && <span className={styles.done}>✓ Completed</span>}
        </div>
      </header>

      <div className={styles.layout}>
        <article className={styles.content}>
          <section className={styles.section} id="understand">
            <div className={styles.sectionHead}>
              <span>01</span>
              <h2>Build your mental model</h2>
            </div>
            <div className={styles.prose}>
              {lesson.sections.map(([heading, body], i) => (
                <div key={i}>
                  <h3>{heading}</h3>
                  <p>{body}</p>
                </div>
              ))}
            </div>
            <div>
              <span className={styles.codeCaption}>{track.name} · worked example</span>
              <pre className={styles.code}>
                <code dangerouslySetInnerHTML={{ __html: example }} />
              </pre>
            </div>
            <p className={styles.explanation}>{lesson.explanation}</p>
            <div className={styles.callout}>
              <span aria-hidden="true">⚡</span>
              <div>
                <strong>Watch for this</strong>
                <p>{lesson.trap}</p>
              </div>
            </div>
          </section>

          <section className={styles.section} id="predict">
            <div className={styles.sectionHead}>
              <span>02</span>
              <h2>Pause. Predict. Then check.</h2>
            </div>
            <Quiz lessonId={lesson.id} quiz={lesson.quiz} />
          </section>

          <section className={styles.section} id="practice">
            <div className={styles.sectionHead}>
              <span>03</span>
              <h2>Make the code yours</h2>
            </div>
            <Challenge lesson={lesson} />
          </section>

          <section className={styles.section} id="reflect">
            <div className={styles.sectionHead}>
              <span>04</span>
              <h2>Explain it in your own words</h2>
            </div>
            <p className={styles.explanation}>{lesson.recall.question}</p>
            <ReflectionNote lessonId={lesson.id} />

            <div className={`${styles.panel} ${styles.completion}`}>
              <div>
                <h3>{done ? "One more concept, made yours." : "Ready to make it stick?"}</h3>
                <p>
                  {done
                    ? "Your review card is ready — revisit it to strengthen recall."
                    : canComplete
                      ? "You checked the concept and passed every code test. Add this to your review deck."
                      : "Check the concept question and pass the coding challenge to complete this lesson."}
                </p>
              </div>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnPrimary}`}
                onClick={complete}
                disabled={!canComplete || done}
              >
                {done ? "Lesson complete ✓" : "Complete lesson"}
              </button>
            </div>
          </section>

          <nav className={styles.nav} aria-label="Lesson navigation">
            {prev ? (
              <Link href={`/learn/lesson/${prev.id}`} className={styles.navLink}>
                <small>Previous</small>
                <strong>{prev.title}</strong>
              </Link>
            ) : (
              <span />
            )}
            {next ? (
              <Link
                href={`/learn/lesson/${next.id}`}
                className={`${styles.navLink} ${styles.navNext}`}
              >
                <small>Up next</small>
                <strong>{next.title}</strong>
              </Link>
            ) : (
              <Link href="/learn" className={`${styles.navLink} ${styles.navNext}`}>
                <small>Path finale</small>
                <strong>Back to overview</strong>
              </Link>
            )}
          </nav>
        </article>

        <aside className={styles.aside}>
          <div className={styles.toc}>
            <div className={styles.tocTitle}>This session</div>
            <TocItem target="understand" label="Understand the concept" />
            <TocItem target="predict" label="Check your intuition" done={quizPassed} />
            <TocItem target="practice" label="Write real code" done={challengeSolved} />
            <TocItem target="reflect" label="Reflect & remember" />
          </div>
          <div className={styles.source}>
            <h3>Go to the source</h3>
            <p>Explore the language reference when you want to go deeper.</p>
            <a href={lesson.docs} target="_blank" rel="noopener noreferrer">
              {lesson.lang === "js" ? "MDN Web Docs" : "Microsoft Learn"} ↗
            </a>
          </div>
        </aside>
      </div>
    </div>
  );
}

function TocItem({
  target,
  label,
  done,
}: {
  target: string;
  label: string;
  done?: boolean;
}) {
  return (
    <button
      type="button"
      className={styles.tocItem}
      onClick={() =>
        document.getElementById(target)?.scrollIntoView({ behavior: "smooth" })
      }
    >
      <span>{target === "understand" ? "01" : target === "predict" ? "02" : target === "practice" ? "03" : "04"}</span>
      {label}
      {done && <i aria-label="done">✓</i>}
    </button>
  );
}

// The recall note. Persisted to `notes[id]`, debounced, and hydrated from saved
// progress until the learner starts typing (same pristine-mirror pattern as the
// challenge draft).
function ReflectionNote({ lessonId }: { lessonId: string }) {
  const { state, update } = useProgress();
  const [value, setValue] = useState("");
  const touched = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (touched.current) return;
    setValue(state.notes[lessonId] ?? "");
  }, [state.notes, lessonId]);

  function onChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const text = e.target.value;
    touched.current = true;
    setValue(text);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      update((prev) => ({ ...prev, notes: { ...prev.notes, [lessonId]: text } }));
    }, NOTE_DEBOUNCE_MS);
  }

  return (
    <>
      <label className="sr-only" htmlFor="lesson-notes">
        Your notes for this lesson
      </label>
      <textarea
        id="lesson-notes"
        className={styles.notes}
        value={value}
        onChange={onChange}
        placeholder="What clicked? What would you explain to a friend? Write it here…"
      />
      <p className={styles.notesCaption}>Saved automatically to your notebook.</p>
    </>
  );
}
