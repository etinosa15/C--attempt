"use client";

// The review deck — the React re-shell of the vanilla studio's renderReview
// (public/app.js). Same active-recall loop: pick the first due card, hide the
// answer, let the learner attempt it, reveal, then rate again/hard/good. The
// rating runs through scheduleReview (core.js) so the interval maths is identical
// to the legacy studio and to the Node sync service. Rating also records activity
// for the streak, exactly as recordActivity() does in the vanilla app.
//
// "Due" selection is app-local (dueCards below), matching public/app.js line 363:
// a card is due when it has no review record yet, or its stored `due` timestamp
// has passed. The "learned / all" toolbar toggles whether unlearned lessons are
// included, so a learner can preview the whole deck before completing lessons.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useProgress } from "@/lib/progress/useProgress";
import { dayKey, scheduleReview, type ReviewRating } from "@/lib/progress/core";
import { lessons, moduleName, type Lesson } from "@/lib/curriculum";
import styles from "./review.module.css";

// Space reveals the answer — the same keyboard affordance the vanilla deck has.
const REVEAL_KEY = " ";

export function Review() {
  const { state, ready, update } = useProgress();
  const [reviewAll, setReviewAll] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [reviewed, setReviewed] = useState(0);

  // The due deck, recomputed whenever progress or the toolbar mode changes. Order
  // follows the authored lesson order, so cards[0] is deterministic — no separate
  // "selected card" state is needed (rating a card drops it from the list and the
  // next card takes its place on the next render).
  const cards = useMemo<Lesson[]>(() => {
    const now = Date.now();
    return lessons.filter(
      (l) =>
        (reviewAll || state.completed.includes(l.id)) &&
        (!state.reviews[l.id] || Number(state.reviews[l.id].due) <= now),
    );
  }, [state.completed, state.reviews, reviewAll]);

  const current = cards[0];

  // Every time the front-most card changes, hide the answer again.
  useEffect(() => {
    setRevealed(false);
  }, [current?.id]);

  // Space reveals — but not while typing in a field, and only before the reveal.
  useEffect(() => {
    if (!current || revealed) return;
    function onKey(e: KeyboardEvent) {
      const el = document.activeElement;
      const typing =
        el instanceof HTMLElement &&
        (el.tagName === "TEXTAREA" ||
          el.tagName === "INPUT" ||
          el.isContentEditable);
      if (e.key === REVEAL_KEY && !typing) {
        e.preventDefault();
        setRevealed(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, revealed]);

  function rate(rating: ReviewRating) {
    if (!current) return;
    update((prev) => ({
      ...prev,
      reviews: {
        ...prev.reviews,
        [current.id]: scheduleReview(prev.reviews[current.id], rating),
      },
      activity: {
        ...prev.activity,
        [dayKey()]: (Number(prev.activity[dayKey()]) || 0) + 1,
      },
    }));
    setReviewed((n) => n + 1);
    setRevealed(false);
  }

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1 className={styles.title}>Review deck</h1>
        <p className={styles.count} aria-live="polite">
          {cards.length} due · {reviewed} reviewed this session
        </p>
      </header>

      <div className={styles.toolbar} role="tablist" aria-label="Review scope">
        <button
          type="button"
          role="tab"
          aria-selected={!reviewAll}
          className={`${styles.tab} ${!reviewAll ? styles.tabActive : ""}`}
          onClick={() => setReviewAll(false)}
        >
          My learned concepts
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={reviewAll}
          className={`${styles.tab} ${reviewAll ? styles.tabActive : ""}`}
          onClick={() => setReviewAll(true)}
        >
          Explore all cards
        </button>
      </div>

      <div className={styles.layout}>
        <section className={styles.main}>
          {current ? (
            <>
              <article className={styles.card}>
                <div className={styles.cardTop}>
                  <span className={styles.badge} data-lang={current.lang}>
                    {current.lang === "js" ? "JavaScript" : "C#"}
                  </span>
                  <span>{moduleName(current.module)}</span>
                  <span className={styles.cardTag}>Recall card</span>
                </div>
                <div className={styles.cardBody}>
                  <div className={styles.eyebrow}>Without looking it up…</div>
                  <h2 className={styles.question}>{current.recall.question}</h2>
                  {revealed ? (
                    <div className={styles.answer}>{current.recall.answer}</div>
                  ) : (
                    <p className={styles.hush}>
                      Take a moment. Say the answer out loud, or write it down.
                    </p>
                  )}
                </div>
                <div className={styles.cardBottom}>
                  {!revealed ? (
                    <>
                      <button
                        type="button"
                        className={`${styles.btn} ${styles.btnPrimary}`}
                        onClick={() => setRevealed(true)}
                      >
                        Reveal answer →
                      </button>
                      <span className={styles.kbd}>Space to reveal</span>
                    </>
                  ) : (
                    <>
                      <span className={styles.rateLabel}>
                        How well did you remember?
                      </span>
                      <div className={styles.ratings}>
                        <button
                          type="button"
                          className={styles.rating}
                          onClick={() => rate("again")}
                        >
                          Again<small>10 minutes</small>
                        </button>
                        <button
                          type="button"
                          className={styles.rating}
                          onClick={() => rate("hard")}
                        >
                          With effort
                          <small>{intervalLabel(state.reviews[current.id], "hard")}</small>
                        </button>
                        <button
                          type="button"
                          className={styles.rating}
                          onClick={() => rate("good")}
                        >
                          Got it
                          <small>{intervalLabel(state.reviews[current.id], "good")}</small>
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </article>
              <Link href={`/learn/lesson/${current.id}`} className={styles.source}>
                Revisit: {current.title} →
              </Link>
            </>
          ) : (
            <div className={styles.empty}>
              <div className={styles.emptyIcon} aria-hidden="true">
                ✳
              </div>
              <h2>
                {state.completed.length || reviewAll
                  ? "You're all caught up."
                  : "Build knowledge. Then keep it."}
              </h2>
              <p>
                {state.completed.length || reviewAll
                  ? "Your cards will return when they're due. Good learning includes a little space."
                  : "Complete your first lesson to add a concept to your personal review deck, or explore all cards for a preview."}
              </p>
              <Link href="/learn" className={`${styles.btn} ${styles.btnPrimary}`}>
                Continue learning
              </Link>
            </div>
          )}
        </section>

        <aside className={styles.explainer}>
          <span className={styles.spark} aria-hidden="true">
            ✳
          </span>
          <h3>A bit of forgetting is useful.</h3>
          <p>Recalling an answer strengthens it more than simply reading it again.</p>
          <ol>
            <li>Attempt an answer before revealing.</li>
            <li>Rate your actual recall, honestly.</li>
            <li>Return when the card is due.</li>
          </ol>
          <div className={styles.calloutSmall}>
            Again returns in 10 minutes. With effort returns soon, then grows
            slowly. Got it grows the interval up to 60 days.
          </div>
        </aside>
      </div>

      {!ready && <p className={styles.loading}>Loading your review deck…</p>}
    </div>
  );
}

// "in 3 days" / "tomorrow": the interval a rating would schedule, previewed on the
// button. Reads scheduleReview without committing, exactly as the vanilla deck does.
function intervalLabel(
  record: { count: number; interval: number; due: number } | undefined,
  rating: ReviewRating,
): string {
  const days = scheduleReview(record, rating).interval;
  if (days <= 0) return "soon";
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
}
