"use client";

// The projects index — the React re-shell of the vanilla studio's renderProjects
// (public/app.js). Six build-it-yourself briefs, filterable by track. Each card
// links to its detail brief and shows milestone progress once the learner has
// checked anything off (progress lives in state.projectChecks, keyed by id).
import { useState } from "react";
import Link from "next/link";
import { useProgress } from "@/lib/progress/useProgress";
import { projects } from "@/lib/curriculum";
import type { Lang } from "@/lib/curriculum";
import styles from "./projects.module.css";

type Filter = "all" | Lang;

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All projects" },
  { key: "js", label: "JavaScript" },
  { key: "cs", label: "C# & full stack" },
];

// The decorative code snippet on each card's art panel, by project order — kept
// verbatim from the vanilla studio so the six briefs read the same at a glance.
const ART_CODE = ["{ habits }", "₦ 12,500", "fetch( )", "/api/books", "recall( )", "JS ⇄ C#"];

export function Projects() {
  const { state } = useProgress();
  const [filter, setFilter] = useState<Filter>("all");
  const filtered = projects.filter((p) => filter === "all" || p.lang === filter);

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <div className={styles.eyebrow}>From understanding to ownership</div>
        <h1 className={styles.title}>Make something that matters.</h1>
        <p className={styles.lead}>
          Six project briefs. Real requirements. A reason to bring everything
          together.
        </p>
      </header>

      <div className={styles.tabs} role="tablist" aria-label="Filter projects by track">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            role="tab"
            aria-selected={filter === f.key}
            className={`${styles.tab} ${filter === f.key ? styles.tabActive : ""}`}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className={styles.grid}>
        {filtered.map((p) => {
          const index = projects.indexOf(p);
          const checks = state.projectChecks[p.id] ?? [];
          return (
            <Link key={p.id} href={`/learn/projects/${p.id}`} className={styles.card}>
              <div className={styles.art} data-art={index % 3}>
                <span className={styles.artCode}>{ART_CODE[index] ?? ""}</span>
                <span className={styles.level}>{p.level}</span>
              </div>
              <div className={styles.body}>
                <div className={styles.meta}>
                  <span className={styles.badge} data-lang={p.lang}>
                    {p.lang === "js" ? "JavaScript" : "C#"}
                  </span>
                  <span>{p.time}</span>
                </div>
                <h2>{p.title}</h2>
                <p>{p.summary}</p>
                <div className={styles.skills}>
                  {p.skills.map((s) => (
                    <span key={s}>{s}</span>
                  ))}
                </div>
                <div className={styles.cardLink}>
                  <span>
                    {checks.length
                      ? `${checks.length} / ${p.steps.length} milestones`
                      : "Open project brief"}
                  </span>
                  <span aria-hidden="true">→</span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
