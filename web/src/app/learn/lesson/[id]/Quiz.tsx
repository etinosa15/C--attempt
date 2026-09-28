"use client";

// The "predict, then check" beat. A single multiple-choice question per lesson.
// Answering correctly records `quizzes[id] = true` exactly once (mirroring
// public/app.js — only a passing quiz is ever stored) and counts toward today's
// activity. The explanation (`why`) is shown on every answer, right or wrong, so
// a miss is still a teaching moment. Half of the lesson's completion gate.
import { useState } from "react";
import { useProgress } from "@/lib/progress/useProgress";
import { dayKey } from "@/lib/progress/core";
import type { Quiz as QuizData } from "@/lib/curriculum";
import styles from "./lesson.module.css";

export function Quiz({ lessonId, quiz }: { lessonId: string; quiz: QuizData }) {
  const { state, update } = useProgress();
  const passed = !!state.quizzes[lessonId];
  const [choice, setChoice] = useState<number | null>(null);
  // Once passed, the concept is settled — reflect that immediately on mount.
  const [answered, setAnswered] = useState(passed);
  const [correct, setCorrect] = useState(passed);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (choice === null) return;
    const right = choice === quiz.answer;
    setAnswered(true);
    setCorrect(right);
    // Store only a pass, only once — never overwrite a correct answer with a
    // later wrong one, and never double-count the activity bump.
    if (right && !state.quizzes[lessonId]) {
      update((prev) => ({
        ...prev,
        quizzes: { ...prev.quizzes, [lessonId]: true },
        activity: {
          ...prev.activity,
          [dayKey()]: (Number(prev.activity[dayKey()]) || 0) + 1,
        },
      }));
    }
  }

  return (
    <div className={styles.panel}>
      <p className={styles.quizQuestion}>{quiz.question}</p>
      <form onSubmit={submit}>
        <fieldset className={styles.choices}>
          <legend className="sr-only">Choose an answer</legend>
          {quiz.choices.map((text, i) => (
            <label key={i} className={styles.choice}>
              <input
                type="radio"
                name={`quiz-${lessonId}`}
                value={i}
                checked={choice === i}
                onChange={() => setChoice(i)}
              />
              <span className={styles.choiceLetter}>{String.fromCharCode(65 + i)}</span>
              <span>{text}</span>
            </label>
          ))}
        </fieldset>
        <button type="submit" className={styles.btn} disabled={choice === null}>
          Check answer
        </button>
      </form>
      {answered && (
        <div
          className={`${styles.feedback} ${correct ? styles.feedbackOk : styles.feedbackNo}`}
          role="status"
        >
          <span aria-hidden="true">{correct ? "✓" : "?"}</span>
          <p style={{ margin: 0 }}>
            <strong>{correct ? "That's it. " : "Not quite — trace the rule again. "}</strong>
            {quiz.why}
          </p>
        </div>
      )}
    </div>
  );
}
