import type { ReactNode } from "react";
import { CodeTracer } from "./CodeTracer";
import { TypeBox } from "./TypeBox";
import { PipelineDiagram } from "./PipelineDiagram";
import { PredictReveal } from "./PredictReveal";

// Lesson-id → visualization. This is a UI-layer map, NOT curriculum data: it adds
// a presentational widget to a lesson without touching the authored content or
// schema. Empty entries simply render nothing. The four below are the Phase 4H
// "build first" set; see docs/ui-polish-plan.md for the backlog of candidates.
export const vizByLesson: Record<string, ReactNode> = {
  "js-values": (
    <PredictReveal
      title="Predict the output"
      code={`const x = "2" + 3;\nconsole.log(x);`}
      answer={`"23"`}
      explain="+ with a string on either side joins instead of adding — so it's the text 23, not 5."
    />
  ),
  "js-operators": (
    <CodeTracer
      title="One + sign, two different jobs"
      code={`const a = 2 + 3;      // two numbers\nconst b = "2" + 3;    // one string\nconst c = "7" - 1;    // minus is maths only`}
      steps={[
        {
          line: 1,
          caption: "Both sides are numbers, so + adds.",
          vars: [{ name: "a", value: "5", type: "number" }],
        },
        {
          line: 2,
          caption: "One side is a string, so + concatenates instead.",
          note: "The number 3 is coerced to the text \"3\".",
          vars: [{ name: "b", value: '"23"', type: "string" }],
        },
        {
          line: 3,
          caption: "− has only one job: subtraction.",
          note: 'So "7" is coerced to the number 7 first.',
          vars: [{ name: "c", value: "6", type: "number" }],
        },
      ]}
    />
  ),
  "cs-types": (
    <TypeBox
      title="A type is a contract"
      declaration="int count = 3;"
      attempts={[
        { code: "count = 10;", ok: true, reason: "10 is an int — the contract holds." },
        { code: 'count = "ten";', ok: false, reason: "a string can't live in an int — it won't compile." },
        { code: "count = 2.5;", ok: false, reason: "2.5 is a double; narrowing to int needs an explicit cast." },
      ]}
    />
  ),
  "cs-methods": (
    <PipelineDiagram
      title="From C# source to a running program"
      stages={[
        { label: "Source .cs", detail: "You write C#, checked against its types as you type." },
        { label: "Roslyn compile", detail: "The compiler verifies types and lowers your code to IL." },
        { label: "IL + metadata", detail: "Portable Intermediate Language is packed into an assembly (.dll/.exe)." },
        { label: "JIT", detail: "At run time the CLR's just-in-time compiler turns IL into native code." },
        { label: "Run", detail: "The native code executes on your machine." },
      ]}
    />
  ),
};

/** The visualization for a lesson, or null if none is registered. */
export function getLessonViz(lessonId: string): ReactNode | null {
  return vizByLesson[lessonId] ?? null;
}
