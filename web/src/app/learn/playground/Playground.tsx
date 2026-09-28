"use client";

// The playground — the React re-shell of the vanilla studio's renderPlayground
// (public/app.js). A blank canvas for experiments: one editor per language backed
// by the "play-<lang>" drafts, Run-only (no grading), plus a JavaScript-only DOM
// lab that runs HTML + JS inside a sandboxed iframe.
//
// JavaScript runs in the same isolated Web Worker the lessons use (useJsRunner);
// C# runs in the loopback .NET program (useCsRunner) when it is reachable — the
// local edition — and is study-only otherwise, exactly as the lesson challenge
// behaves. The DOM lab is deliberately isolated from the learner's data: its
// iframe has sandbox="allow-scripts" WITHOUT allow-same-origin, so page code runs
// from an opaque origin and cannot reach this origin's storage.
import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Editor } from "@/components/Editor";
import { FocusCard } from "@/components/FocusCard";
import { useProgress } from "@/lib/progress/useProgress";
import { useJsRunner } from "@/lib/runner/useJsRunner";
import { useCsRunner } from "@/lib/runner/useCsRunner";
import { explainError } from "@/lib/progress/core";
import type { Lang, RunResult } from "@/lib/curriculum";
import styles from "./playground.module.css";

const DRAFT_DEBOUNCE_MS = 500;

// Editor seeds — captured verbatim from the vanilla studio's playgroundStarters.
const STARTERS: Record<Lang, string> = {
  js: '// Your space to experiment. Change something. Run it again.\nconst skills = ["curiosity", "practice", "persistence"];\n\nfunction buildSomething(ingredients) {\n  return ingredients.map(skill => skill.toUpperCase());\n}\n\nconsole.log("Hello, possibility.");\nconsole.log(buildSomething(skills));\n',
  cs: '// Real C#, compiled and run with your local .NET SDK.\nvar skills = new[] { "curiosity", "practice", "persistence" };\n\nConsole.WriteLine("Hello, possibility.");\nforeach (var skill in skills)\n{\n    Console.WriteLine(skill.ToUpperInvariant());\n}\n',
};
const DOM_HTML_STARTER =
  "<h2>Make something happen.</h2>\n<button>Say hello</button>\n<output></output>";
const DOM_JS_STARTER =
  'document.querySelector("button").addEventListener("click", () => {\n  document.querySelector("output").textContent = "Hello, developer!";\n});';

function toLang(raw: string | null): Lang {
  return raw === "cs" ? "cs" : "js";
}

// The C# runtime label reflects the loopback probe: study-only until it answers.
function runtimeLabel(lang: Lang, available: boolean | null, sdk: string): string {
  if (lang === "js") return "Browser runtime";
  if (available === null) return "Checking for the local .NET runner…";
  if (available === false) return "C# runs in the local edition";
  return `Real .NET compiler${sdk ? ` · ${sdk}` : ""}`;
}

function PlaygroundInner() {
  const { state, update } = useProgress();
  const router = useRouter();
  const params = useSearchParams();
  const [playLang, setPlayLang] = useState<Lang>(() => toLang(params.get("lang")));
  const js = useJsRunner();
  const cs = useCsRunner();
  const running = playLang === "js" ? js.running : cs.running;
  // JS is always runnable; C# only when the loopback .NET runner answers.
  const canRun = playLang === "js" || cs.available === true;

  const [code, setCode] = useState("");
  const [result, setResult] = useState<RunResult | null>(null);
  const touched = useRef(false);
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // On a language switch, forget the touch flag so the new language's draft (or
  // its starter) hydrates in; typing sets it again. Also clear the last output.
  useEffect(() => {
    touched.current = false;
    setResult(null);
  }, [playLang]);
  useEffect(() => {
    if (touched.current) return;
    setCode(state.drafts[`play-${playLang}`] ?? STARTERS[playLang]);
  }, [state.drafts, playLang]);

  function persistDraft(key: string, value: string) {
    update((prev) => ({ ...prev, drafts: { ...prev.drafts, [key]: value } }));
  }
  function onCodeChange(value: string) {
    touched.current = true;
    setCode(value);
    if (draftTimer.current) clearTimeout(draftTimer.current);
    const key = `play-${playLang}`;
    draftTimer.current = setTimeout(() => persistDraft(key, value), DRAFT_DEBOUNCE_MS);
  }

  function selectLang(lang: Lang) {
    if (lang === playLang) return;
    if (draftTimer.current) clearTimeout(draftTimer.current);
    persistDraft(`play-${playLang}`, code); // keep the exact text before leaving
    setPlayLang(lang);
    router.replace(`/learn/playground?lang=${lang}`, { scroll: false });
  }

  async function run() {
    if (draftTimer.current) clearTimeout(draftTimer.current);
    persistDraft(`play-${playLang}`, code); // never lose the code that was run
    // No tests: JS runs output-only; C# sends no lesson id, so the loopback
    // program just compiles and runs. Both come back as the shared RunResult.
    const r = playLang === "js" ? await js.run(code, []) : await cs.run(code);
    setResult(r);
  }

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <div className={styles.eyebrow}>Make room for experiments</div>
        <h1 className={styles.title}>A blank canvas. A working mind.</h1>
        <p className={styles.lead}>
          Try an idea, break something, follow your curiosity. Your drafts stay
          right here.
        </p>
      </header>

      <div className={styles.layout}>
        <section className={styles.main}>
          <div className={styles.controls}>
            <div className={styles.tabs} role="tablist" aria-label="Playground language">
              <button
                type="button"
                role="tab"
                aria-selected={playLang === "js"}
                className={`${styles.tab} ${playLang === "js" ? styles.tabActive : ""}`}
                onClick={() => selectLang("js")}
              >
                JavaScript
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={playLang === "cs"}
                className={`${styles.tab} ${playLang === "cs" ? styles.tabActive : ""}`}
                onClick={() => selectLang("cs")}
              >
                C# / .NET
              </button>
            </div>
            <span className={styles.runtimeLabel}>
              {runtimeLabel(playLang, cs.available, cs.sdk)}
            </span>
          </div>

          <Editor
            value={code}
            onChange={onCodeChange}
            lang={playLang}
            ariaLabel="Playground code editor"
          />

          <div className={styles.runRow}>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnPrimary}`}
              onClick={run}
              disabled={!canRun || running}
            >
              {running ? "Running…" : "Run"}
            </button>
          </div>

          <div className={styles.note}>
            <p>
              {playLang === "js"
                ? "This is a JavaScript console, without a DOM. Top-level await is supported — await asynchronous work before the run ends. For DOM practice, use the browser lab below."
                : "Write a complete console program. Common System namespaces are imported for you. Put top-level statements before any class and record declarations."}
            </p>
          </div>

          {result && <RunOutput result={result} lang={playLang} />}

          {playLang === "js" && <DomLab />}
        </section>

        <aside className={styles.aside}>
          <FocusCard />
          <div className={styles.promptsCard}>
            <h3>Follow a small question.</h3>
            <p>What happens if the input is empty?</p>
            <p>Can I explain each line out loud?</p>
            <p>What is the simplest version that works?</p>
            <p>How would I test this behavior?</p>
          </div>
          <Link href="/learn/projects" className={styles.projectLink}>
            Ready for something bigger?
            <strong>Pick a project →</strong>
          </Link>
        </aside>
      </div>
    </div>
  );
}

function RunOutput({ result, lang }: { result: RunResult; lang: Lang }) {
  const guide = result.error ? explainError(result.error, lang) : null;
  return (
    <div className={styles.output}>
      <div className={styles.outputHead}>Output</div>
      {result.error && (
        <div className={styles.runError}>
          <strong>{guide ? guide.summary : "Something to investigate"}</strong>
          {guide && <p style={{ margin: "0.3rem 0 0" }}>{guide.hint}</p>}
          <pre>{result.error}</pre>
        </div>
      )}
      {result.output ? (
        <pre className={styles.console}>{result.output}</pre>
      ) : (
        !result.error && <p className={styles.empty}>Ran with no output.</p>
      )}
    </div>
  );
}

// The browser lab — JavaScript only. Two plain editors (HTML + JS) feed a
// sandboxed iframe served same-origin from /dom-preview.html. Each run remounts
// the frame (a clean document every time) and, once it has loaded, posts the
// HTML + code in; the frame reports console output back via postMessage. The
// frame's opaque origin (no allow-same-origin) keeps page code away from our data.
function DomLab() {
  const { state, update } = useProgress();
  const [html, setHtml] = useState("");
  const [jsCode, setJsCode] = useState("");
  const [output, setOutput] = useState("");
  const [frameKey, setFrameKey] = useState(0);
  const touchedHtml = useRef(false);
  const touchedJs = useRef(false);
  const htmlTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const jsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<{ html: string; code: string } | null>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (!touchedHtml.current) setHtml(state.drafts["dom-html"] ?? DOM_HTML_STARTER);
    if (!touchedJs.current) setJsCode(state.drafts["dom-js"] ?? DOM_JS_STARTER);
  }, [state.drafts]);

  // Console output the sandboxed frame posts back after a run.
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.data?.type === "forge-dom-output") setOutput(String(e.data.message));
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  function persist(key: string, value: string) {
    update((prev) => ({ ...prev, drafts: { ...prev.drafts, [key]: value } }));
  }
  function onHtmlChange(value: string) {
    touchedHtml.current = true;
    setHtml(value);
    if (htmlTimer.current) clearTimeout(htmlTimer.current);
    htmlTimer.current = setTimeout(() => persist("dom-html", value), DRAFT_DEBOUNCE_MS);
  }
  function onJsChange(value: string) {
    touchedJs.current = true;
    setJsCode(value);
    if (jsTimer.current) clearTimeout(jsTimer.current);
    jsTimer.current = setTimeout(() => persist("dom-js", value), DRAFT_DEBOUNCE_MS);
  }

  function runPreview() {
    if (htmlTimer.current) clearTimeout(htmlTimer.current);
    if (jsTimer.current) clearTimeout(jsTimer.current);
    persist("dom-html", html);
    persist("dom-js", jsCode);
    // Hand the payload to the frame once it reloads (onFrameLoad); remounting via
    // the key guarantees a fresh document for each run.
    pending.current = { html, code: jsCode };
    setOutput("");
    setFrameKey((k) => k + 1);
  }
  function onFrameLoad() {
    const payload = pending.current;
    if (!payload || !frameRef.current?.contentWindow) return;
    frameRef.current.contentWindow.postMessage(
      { type: "forge-dom", html: payload.html, code: payload.code },
      "*",
    );
    pending.current = null;
  }

  return (
    <section className={styles.domLab}>
      <div className={styles.sectionTitle}>
        <h2>A little browser lab</h2>
        <span className={styles.pill}>DOM + EVENTS</span>
      </div>
      <p className={styles.domIntro}>
        Connect an actual button to the page. This preview is isolated from your
        learning data.
      </p>
      <label className={styles.domLabel} htmlFor="dom-html">
        HTML
      </label>
      <textarea
        id="dom-html"
        className={styles.miniEditor}
        value={html}
        onChange={(e) => onHtmlChange(e.target.value)}
        spellCheck={false}
      />
      <label className={styles.domLabel} htmlFor="dom-js">
        JavaScript
      </label>
      <textarea
        id="dom-js"
        className={styles.miniEditor}
        value={jsCode}
        onChange={(e) => onJsChange(e.target.value)}
        spellCheck={false}
      />
      <div className={styles.runRow}>
        <button
          type="button"
          className={`${styles.btn} ${styles.btnPrimary}`}
          onClick={runPreview}
        >
          Update preview
        </button>
      </div>
      <iframe
        key={frameKey}
        ref={frameRef}
        onLoad={onFrameLoad}
        title="Isolated DOM practice preview"
        className={styles.frame}
        src="/dom-preview.html"
        sandbox="allow-scripts"
      />
      <pre className={styles.domOutput} role="status">
        {output}
      </pre>
    </section>
  );
}

// useSearchParams must sit under a Suspense boundary for static rendering.
export function Playground() {
  return (
    <Suspense fallback={null}>
      <PlaygroundInner />
    </Suspense>
  );
}
