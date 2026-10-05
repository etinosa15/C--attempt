"use client";

import { useState } from "react";
import Link from "next/link";
import { useProgress } from "@/lib/progress/useProgress";
import { streak, certificateEarned } from "@/lib/progress/core";
import { summarizeGamification } from "@/lib/progress/gamification";
import { tracks, lessonsById, type Lang } from "@/lib/curriculum";
import { useEntitlement } from "@/lib/entitlements/EntitlementProvider";
import { canEarnCertificate, isLessonLocked } from "@/lib/entitlements/gating";
import { CertificateDialog } from "@/components/CertificateDialog";
import styles from "./overview.module.css";

const TRACK_ORDER: Lang[] = ["js", "cs"];

export default function Overview() {
  const { state, ready } = useProgress();
  const entitlement = useEntitlement();
  const [certLang, setCertLang] = useState<Lang | null>(null);
  const certsUnlocked = canEarnCertificate(entitlement);

  const done = new Set(state.completed ?? []);
  const days = streak(state.activity ?? {});
  const resume = state.lastLesson ? lessonsById.get(state.lastLesson) : undefined;
  const game = summarizeGamification(state, days);
  const levelPct = Math.round(game.level.progress * 100);

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1 className={styles.title}>Keep building</h1>
        <p className={styles.streak} aria-live="polite">
          {days > 0 ? (
            <>
              <strong>{days}</strong> day{days === 1 ? "" : "s"} in a row
            </>
          ) : (
            "Start a streak today"
          )}
        </p>
      </header>

      {resume && (
        <Link href={`/learn/lesson/${resume.id}`} className={styles.resume}>
          <span className={styles.resumeLabel}>Continue where you left off</span>
          <span className={styles.resumeTitle}>{resume.title}</span>
          <span className={styles.resumeCta} aria-hidden="true">
            Resume →
          </span>
        </Link>
      )}

      <section className={styles.level} aria-label="Your level">
        <div className={styles.levelHead}>
          <span className={styles.levelName}>
            Level <strong>{game.level.level}</strong> · {game.level.title}
          </span>
          <span className={styles.levelXp}>
            {game.level.xpIntoLevel} / {game.level.xpForLevel} XP ·{" "}
            {game.earnedCount}/{game.totalBadges} badges
          </span>
        </div>
        <div
          className={styles.levelBar}
          role="progressbar"
          aria-valuenow={levelPct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Progress to the next level"
        >
          <span className={styles.levelFill} style={{ width: `${levelPct}%` }} />
        </div>
      </section>


      <div className={styles.tracks}>
        {TRACK_ORDER.map((lang) => {
          const track = tracks[lang];
          const total = track.lessons.length;
          const complete = track.lessons.filter((l) => done.has(l.id)).length;
          const percent = total > 0 ? Math.round((complete / total) * 100) : 0;
          const next = track.lessons.find((l) => !done.has(l.id)) ?? track.lessons[0];
          const earned = certificateEarned(state.completed ?? [], track.lessons.map((l) => l.id));
          const nextLocked = next ? isLessonLocked(entitlement, next) : false;

          return (
            <section key={lang} className={styles.track} style={{ ["--track" as string]: track.color }}>
              <div className={styles.trackHead}>
                <h2 className={styles.trackName}>{track.name}</h2>
                <span className={styles.trackTag}>{track.tag}</span>
              </div>
              <p className={styles.trackDesc}>{track.description}</p>

              <div className={styles.progress}>
                <div className={styles.bar} role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
                  <span className={styles.fill} style={{ width: `${percent}%` }} />
                </div>
                <span className={styles.count}>
                  {complete} / {total} lessons
                </span>
              </div>

              {next && (
                <div className={styles.ctaRow}>
                  <Link href={`/learn/lesson/${next.id}`} className={styles.trackCta}>
                    {complete === 0 ? "Start the track" : complete === total ? "Review lessons" : `Next: ${next.title}`}
                    {nextLocked && <span className={styles.lock} aria-label="Pro lesson"> 🔒</span>}
                  </Link>
                  {earned &&
                    (certsUnlocked ? (
                      <button
                        type="button"
                        className={styles.certBtn}
                        onClick={() => setCertLang(lang)}
                      >
                        View certificate
                      </button>
                    ) : (
                      <Link href="/pricing" className={styles.certBtn}>
                        Unlock certificate (Pro)
                      </Link>
                    ))}
                </div>
              )}
            </section>
          );
        })}
      </div>

      {certLang && (
        <CertificateDialog lang={certLang} onClose={() => setCertLang(null)} />
      )}

      <section aria-label="Achievements">
        <h2 className={styles.sectionLabel}>Achievements</h2>
        <div className={styles.badges}>
          {game.badges.map((b) => (
            <div
              key={b.id}
              className={`${styles.badge} ${b.earned ? styles.badgeEarned : ""}`}
            >
              <span
                className={`${styles.badgeMark} ${b.earned ? "" : styles.badgeLocked}`}
                aria-hidden="true"
              >
                {b.earned ? "★" : "☆"}
              </span>
              <span>
                <span className={styles.badgeTitle}>{b.title}</span>
                <span className={styles.badgeDesc}>{b.description}</span>
              </span>
            </div>
          ))}
        </div>
      </section>

      {!ready && <p className={styles.loading}>Loading your progress…</p>}
    </div>
  );
}
