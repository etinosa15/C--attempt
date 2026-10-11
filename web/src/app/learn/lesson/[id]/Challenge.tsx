"use client";

// The "make the code yours" beat: an editor seeded from the learner's saved draft
// (or the starter), a Run/Check button, and staged hints. Passing every check
// records the lesson id in `solved` once and counts toward today's activity —
// the other half of the completion gate (see canComplete in the vanilla studio).
//
// JavaScript runs in the isolated in-browser Web Worker (useJsRunner). C# runs in
// the vanilla studio's loopback .NET program (useCsRunner) when it is reachable —
// the local edition; in the hosted edition no runner answers, so the challenge is
// fully editable and its solution is revealable, but Check is replaced by a note
// pointing to the local edition. This mirrors the studio's hosted/local C# split.
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Editor } from "@/components/Editor";
import { useProgress } from "@/lib/progress/useProgress";
import { useJsRunner } from "@/lib/runner/useJsRunner";
import { useCsRunner } from "@/lib/runner/useCsRunner";
import { useCsWasmRunner } from "@/lib/runner/useCsWasmRunner";
import { useEntitlement } from "@/lib/entitlements/EntitlementProvider";
import { canRunCsharp, canUseAiTutor } from "@/lib/entitlements/gating";
import {
  dayKey,
  hintTiers,
  formatValue,
  valueKind,
  typeMismatch,
  explainError,
  type HintTier,
} from "@/lib/progress/core";
import type { Lesson, RunResult } from "@/lib/curriculum";
import styles from "./lesson.module.css";

const DRAFT_DEBOUNCE_MS = 500;

// "an array" / "a string": kind name with the right article.
const withArticle = (value: unknown) => {
  const kind = valueKind(value);
  return (/^[aeiou]/i.test(kind) ? "an " : "a ") + kind;
};

export function Challenge({ lesson }: { lesson: Lesson }) {
  const { state, update } = useProgress();
  const isJs = lesson.lang === "js";
  const js = useJsRunner();
  const cs = useCsRunner();
  const csWasm = useCsWasmRunner();
  const entitlement = useEntitlement();

  // C# runner precedence: the local edition's loopback .NET SDK when present (full
  // compiler, grades server-side); otherwise, for a Pro learner on the hosted site,
  // the in-browser .NET WASM runtime once it's deployed (grades client-side); else
  // read-only. `cs.available`/`csWasm.available` are null while probing. JS always runs.
  const useWasm =
    !isJs && cs.available !== true && canRunCsharp(entitlement) && csWasm.available === true;
  const running = isJs ? js.running : useWasm ? csWasm.running : cs.running;
  const canRun = isJs || cs.available === true || useWasm;

  const [code, setCode] = useState(lesson.challenge.starter);
  const [result, setResult] = useState<RunResult | null>(null);
  const [tutorHint, setTutorHint] = useState<string | null>(null);
  const [tutorNote, setTutorNote] = useState<string | null>(null);
  const [tutorBusy, setTutorBusy] = useState(false);
  const touched = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hydrate the editor from the saved draft once progress loads, but stop as
  // soon as the learner types so we never clobber an in-progress edit.
  useEffect(() => {
    if (touched.current) return;
    setCode(state.drafts[lesson.id] ?? lesson.challenge.starter);
  }, [state.drafts, lesson.id, lesson.challenge.starter]);

  // Flush-safe cleanup: cancel a pending draft-save debounce on unmount.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const persistDraft = (value: string) => {
    update((prev) => ({ ...prev, drafts: { ...prev.drafts, [lesson.id]: value } }));
  };

  function onCodeChange(value: string) {
    touched.current = true;
    setCode(value);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => persistDraft(value), DRAFT_DEBOUNCE_MS);
  }

  function reset() {
    if (timerRef.current) clearTimeout(timerRef.current);
    touched.current = true;
    setCode(lesson.challenge.starter);
    persistDraft(lesson.challenge.starter);
  }

  const tiers = hintTiers(lesson);
  const unlocked = Math.min(state.hints[lesson.id] || 0, tiers.length);

  function revealHint() {
    update((prev) => ({
      ...prev,
      hints: {
        ...prev.hints,
        [lesson.id]: Math.min((prev.hints[lesson.id] || 0) + 1, tiers.length),
      },
    }));
  }

  // The hosted AI tutor (Pro, metered server-side). It coaches toward the first
  // failing check and never writes the solution (enforced by the shared prompt on
  // the server). Any non-200 degrades to a quiet note pointing at the always-free
  // staged hints below — the tutor is only ever an upgrade over them.
  async function askTutor() {
    if (!result) return;
    setTutorBusy(true);
    setTutorNote(null);
    setTutorHint(null);
    const fail = result.checks.find((c) => !c.passed);
    try {
      const res = await fetch("/api/tutor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lang: lesson.lang,
          title: lesson.title,
          prompt: lesson.challenge.prompt,
          code,
          error: result.error ?? null,
          tier: unlocked,
          passed: result.checks.filter((c) => c.passed).length,
          total: result.checks.length,
          firstFailing: fail ? { label: fail.label, expected: fail.expected } : null,
        }),
      });
      if (res.status === 429) {
        setTutorNote("You've used today's tutor hints — they refresh tomorrow. The staged hints below still work.");
        return;
      }
      if (!res.ok) {
        setTutorNote("The study buddy is unavailable right now. Try the staged hints below.");
        return;
      }
      const data = (await res.json()) as { message?: string; configured?: boolean };
      if (data.configured === false || !data.message) {
        setTutorNote("The study buddy isn't live in this build yet — the staged hints below always work.");
        return;
      }
      setTutorHint(data.message);
    } catch {
      setTutorNote("The study buddy is unavailable right now. Try the staged hints below.");
    } finally {
      setTutorBusy(false);
    }
  }

  async function check() {
    if (timerRef.current) clearTimeout(timerRef.current);
    persistDraft(code); // never lose the exact code that was run
    setTutorHint(null); // a fresh run supersedes any previous buddy hint
    setTutorNote(null);
    // JS and the hosted C# WASM runner grade in the browser against the lesson's
    // tests; the loopback C# runner sends only the code + lesson id and grades
    // against its own copy of the tests. All three return the same RunResult.
    const r = isJs
      ? await js.run(code, lesson.challenge.tests)
      : useWasm
        ? await csWasm.run(code, lesson.challenge.tests)
        : await cs.run(code, lesson.id);
    setResult(r);
    const allPassed =
      r.checks.length === lesson.challenge.tests.length &&
      r.checks.length > 0 &&
      r.checks.every((c) => c.passed);
    if (allPassed) {
      // Record the solve + today's activity exactly once. Both the dedupe and the
      // activity bump read `prev.solved` (one source of truth), so two rapid passing
      // runs that race before a re-render can't double-count the day's activity.
      update((prev) => {
        if (prev.solved.includes(lesson.id)) return prev;
        return {
          ...prev,
          solved: [...prev.solved, lesson.id],
          activity: {
            ...prev.activity,
            [dayKey()]: (Number(prev.activity[dayKey()]) || 0) + 1,
          },
        };
      });
    } else if (unlocked < tiers.length) {
      // A check ran short — surface the next staged hint, exactly when stuck.
      revealHint();
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <p className={styles.prompt}>{lesson.challenge.prompt}</p>

      {!isJs && !useWasm && cs.available === null && (
        <p className={styles.csNotice}>Checking for the local .NET runner…</p>
      )}
      {!isJs && !useWasm && cs.available === false && csWasm.available !== null && (
        <p className={styles.csNotice}>
          You can write and study this C# solution here. Running and checking C#
          needs the local edition — a small program that compiles C# with .NET on
          your computer. Your drafts travel with your progress, so pick up right
          here once it&apos;s running.
        </p>
      )}

      <Editor
        value={code}
        onChange={onCodeChange}
        lang={lesson.lang}
        ariaLabel={`${lesson.title} code editor`}
      />

      <div className={styles.runRow}>
        <button
          type="button"
          className={styles.btnPrimary + " " + styles.btn}
          onClick={check}
          disabled={!canRun || running}
        >
          {running ? "Running…" : "Check solution"}
        </button>
        <button type="button" className={styles.btn} onClick={reset}>
          Reset
        </button>
        {!isJs && cs.available === true && (
          <span className={styles.runtimeLabel}>
            Real .NET compiler{cs.sdk ? ` · ${cs.sdk}` : ""}
          </span>
        )}
        {useWasm && (
          <span className={styles.runtimeLabel}>Running C# in your browser · .NET</span>
        )}
      </div>

      {result && <RunOutput result={result} lang={lesson.lang} />}

      {result && !result.ok && (
        <div className={styles.tutor}>
          {canUseAiTutor(entitlement) ? (
            <>
              <button
                type="button"
                className={styles.btn}
                onClick={askTutor}
                disabled={tutorBusy}
              >
                {tutorBusy ? "Thinking…" : "Ask the study buddy"}
              </button>
              {tutorHint && (
                <p className={styles.tutorHint} role="status" aria-live="polite">
                  {tutorHint}
                </p>
              )}
              {tutorNote && <p className={styles.csNotice}>{tutorNote}</p>}
            </>
          ) : (
            <p className={styles.csNotice}>
              Stuck? The AI study buddy is a{" "}
              <Link href="/pricing" className={styles.tutorLink}>
                Pro
              </Link>{" "}
              feature — the staged hints below are always free.
            </p>
          )}
        </div>
      )}

      <Hints
        tiers={tiers}
        unlocked={unlocked}
        solution={lesson.challenge.solution}
        onReveal={revealHint}
      />
    </div>
  );
}

function RunOutput({ result, lang }: { result: RunResult; lang: string }) {
  const guide = result.error ? explainError(result.error, lang as "js" | "cs") : null;
  const total = result.checks.length;
  const passed = result.checks.filter((c) => c.passed).length;

  return (
    <div className={styles.output}>
      <div className={styles.outputHead}>Output &amp; test results</div>
      {result.error && (
        <div className={styles.runError}>
          <strong>{guide ? guide.summary : "Something to investigate"}</strong>
          {guide && <p style={{ margin: "0 0 0.4rem" }}>{guide.hint}</p>}
          <pre>{result.error}</pre>
        </div>
      )}
      {result.output && <pre className={styles.console}>{result.output}</pre>}
      {total > 0 && (
        <>
          <div
            className={`${styles.summary} ${passed === total ? styles.summaryPass : styles.summaryFail}`}
          >
            {passed} / {total} checks passed
          </div>
          {result.checks.map((c, i) => (
            <div
              key={i}
              className={`${styles.check} ${c.passed ? styles.checkPass : styles.checkFail}`}
            >
              <span className={styles.checkMark} aria-hidden="true">
                {c.passed ? "✓" : "×"}
              </span>
              <div>
                <strong>{c.label}</strong>
                {!c.passed && (
                  <small>
                    Expected <code>{formatValue(c.expected)}</code>
                    <br />
                    Received <code>{formatValue(c.actual)}</code>
                    {typeMismatch(c.expected, c.actual) && (
                      <>
                        <br />
                        The value is right, but the type is not: expected{" "}
                        {withArticle(c.expected)}, received {withArticle(c.actual)}.
                      </>
                    )}
                  </small>
                )}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function Hints({
  tiers,
  unlocked,
  solution,
  onReveal,
}: {
  tiers: HintTier[];
  unlocked: number;
  solution: string;
  onReveal: () => void;
}) {
  const next = tiers[unlocked];
  return (
    <div className={styles.hints}>
      {unlocked === 0 && (
        <p className={styles.hintLead}>
          Stuck? Reveal staged help one step at a time. Hints also surface on their
          own when your checks keep coming up short.
        </p>
      )}
      {tiers.slice(0, unlocked).map((tier, i) => (
        <div key={i} className={styles.hint}>
          <strong>{tier.title}</strong>
          {tier.solution ? (
            <pre className={styles.code} style={{ marginTop: "0.5rem" }}>
              {solution}
            </pre>
          ) : (
            <span>{tier.body}</span>
          )}
        </div>
      ))}
      {next && (
        <button type="button" className={styles.btn} onClick={onReveal}>
          {unlocked === 0
            ? "Show a hint"
            : next.solution
              ? "Reveal the worked solution"
              : "Show another hint"}
        </button>
      )}
    </div>
  );
}
