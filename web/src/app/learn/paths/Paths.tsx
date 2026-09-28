"use client";

// The per-module lesson drill-down — the React re-shell of the vanilla studio's
// renderPaths (public/app.js). A tab bar switches between all paths, one track,
// or the language bridge; each track shows its modules as a grid of lesson rows
// with a checkmark on the ones already completed, and a certificate button once
// the track hits 100%. All state is read from the shared ProgressProvider.
import { useState } from "react";
import Link from "next/link";
import { useProgress } from "@/lib/progress/useProgress";
import { certificateEarned, highlight } from "@/lib/progress/core";
import { tracks, modules, bridges, type Lang } from "@/lib/curriculum";
import { CertificateDialog } from "@/components/CertificateDialog";
import styles from "./paths.module.css";

export type PathFilter = "all" | "js" | "cs" | "compare";

const TABS: { key: PathFilter; label: string; count?: number }[] = [
  { key: "all", label: "All paths" },
  { key: "js", label: "JavaScript", count: tracks.js.lessons.length },
  { key: "cs", label: "C#", count: tracks.cs.lessons.length },
  { key: "compare", label: "Language bridge" },
];

const LANGS: Lang[] = ["js", "cs"];

const pad = (n: number) => String(n).padStart(2, "0");

export function Paths({ initialFilter }: { initialFilter: PathFilter }) {
  const { state } = useProgress();
  const [filter, setFilter] = useState<PathFilter>(initialFilter);
  const [certLang, setCertLang] = useState<Lang | null>(null);
  const done = new Set(state.completed ?? []);

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <div className={styles.eyebrow}>Your roadmap</div>
        <h1 className={styles.title}>Learn the why. Master the how.</h1>
        <p className={styles.lead}>
          Forty focused lessons. Every one turns a concept into something you can
          do.
        </p>
      </header>

      <div className={styles.tabs} role="group" aria-label="Choose curriculum">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`${styles.tab} ${filter === tab.key ? styles.tabActive : ""}`}
            aria-pressed={filter === tab.key}
            onClick={() => setFilter(tab.key)}
          >
            {tab.label}
            {tab.count != null && <span className={styles.tabCount}>{tab.count}</span>}
          </button>
        ))}
      </div>

      {filter === "compare" ? (
        <div className={styles.bridgeGrid}>
          {bridges.map((b) => (
            <article key={b.title} className={styles.bridge}>
              <h2 className={styles.bridgeTitle}>{b.title}</h2>
              <div className={styles.comparison}>
                <figure className={styles.codeFig}>
                  <figcaption className={styles.codeCaption}>JavaScript</figcaption>
                  <pre className={styles.code}>
                    <code dangerouslySetInnerHTML={{ __html: highlight(b.js, "js") }} />
                  </pre>
                </figure>
                <figure className={styles.codeFig}>
                  <figcaption className={styles.codeCaption}>C#</figcaption>
                  <pre className={styles.code}>
                    <code dangerouslySetInnerHTML={{ __html: highlight(b.cs, "cs") }} />
                  </pre>
                </figure>
              </div>
              <p className={styles.bridgeNote}>{b.note}</p>
            </article>
          ))}
        </div>
      ) : (
        LANGS.filter((lang) => filter === "all" || lang === filter).map((lang) => {
          const track = tracks[lang];
          const total = track.lessons.length;
          const complete = track.lessons.filter((l) => done.has(l.id)).length;
          const percent = total > 0 ? Math.round((complete / total) * 100) : 0;
          const earned = certificateEarned(
            state.completed ?? [],
            track.lessons.map((l) => l.id),
          );

          return (
            <section
              key={lang}
              className={styles.track}
              style={{ ["--track" as string]: track.color }}
            >
              <div className={styles.trackHead}>
                <div className={styles.trackId}>
                  <h2 className={styles.trackName}>{track.name}</h2>
                  <p className={styles.trackTag}>{track.tag.toLowerCase()}</p>
                </div>
                <span className={styles.trackPct}>{percent}% complete</span>
                {earned && (
                  <button
                    type="button"
                    className={styles.certBtn}
                    onClick={() => setCertLang(lang)}
                  >
                    View certificate
                  </button>
                )}
              </div>

              <div className={styles.moduleGrid}>
                {modules.map((module, i) => {
                  const group = track.lessons.filter((l) => l.module === i);
                  if (group.length === 0) return null;
                  const minutes = group.reduce((s, l) => s + l.minutes, 0);
                  return (
                    <div key={module} className={styles.module}>
                      <div className={styles.moduleHead}>
                        <span className={styles.moduleIndex}>{pad(i + 1)}</span>
                        <div>
                          <h3 className={styles.moduleName}>{module}</h3>
                          <small className={styles.moduleMeta}>
                            {minutes} min · {group.length} lesson
                            {group.length === 1 ? "" : "s"}
                          </small>
                        </div>
                      </div>
                      {group.map((l) => {
                        const isDone = done.has(l.id);
                        const order = track.lessons.indexOf(l) + 1;
                        return (
                          <Link
                            key={l.id}
                            href={`/learn/lesson/${l.id}`}
                            className={`${styles.lesson} ${isDone ? styles.lessonDone : ""}`}
                          >
                            <span className={styles.lessonOrder}>
                              {isDone ? "✓" : pad(order)}
                            </span>
                            <span className={styles.lessonBody}>
                              {l.title}
                              <small>{l.minutes} min · Lesson + challenge</small>
                            </span>
                            <span className={styles.chevron} aria-hidden="true">
                              ›
                            </span>
                          </Link>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })
      )}

      {certLang && <CertificateDialog lang={certLang} onClose={() => setCertLang(null)} />}
    </div>
  );
}
