// TypeScript contracts for the curriculum data authored in repo-root
// public/{curriculum,js-lessons,cs-lessons}.js. Those files are plain ES modules
// with no types of their own; this is the ONE place that describes their shape so
// the React surface (lesson pages, editor, runner, review, projects) can consume
// them with real inference instead of `any`. The data files stay the source of
// truth — these interfaces must track them, not the other way round. Verified
// against the `add()` lesson factory and the `projects`/`tracks`/`bridges` exports.

/** The two — and only two — tracks this academy teaches. No Python. */
export type Lang = "js" | "cs";

/** One graded check inside a lesson challenge, evaluated by the runner. */
export interface ChallengeTest {
  /** Human-readable label shown next to the pass/fail mark. */
  label: string;
  /** Expression evaluated against the learner's submission. */
  expression: string;
  /** The value `expression` must produce for the check to pass. */
  expected: unknown;
}

/** The single multiple-choice question attached to every lesson. */
export interface Quiz {
  question: string;
  choices: string[];
  /** Index into `choices` of the correct answer. */
  answer: number;
  /** Shown after answering, right or wrong. */
  why: string;
}

/** The hands-on coding task at the end of a lesson. */
export interface Challenge {
  prompt: string;
  /** Editor seed the learner starts from. */
  starter: string;
  /** Reference solution, revealed by the final hint tier. */
  solution: string;
  tests: ChallengeTest[];
}

/** The spaced-repetition recall prompt (front/back of one card). */
export interface Recall {
  question: string;
  answer: string;
}

/**
 * A single lesson, as produced by the `add()` factory in js-lessons.js /
 * cs-lessons.js. NOTE: `module` is a numeric INDEX into the `modules` string
 * array, not a name; `sections` is a list of [heading, body] pairs.
 */
export interface Lesson {
  /** e.g. "js-variables" / "cs-methods" — unique across both tracks. */
  id: string;
  lang: Lang;
  /** Index into `modules`. */
  module: number;
  title: string;
  minutes: number;
  lead: string;
  /** [heading, body] pairs. */
  sections: [string, string][];
  example: string;
  explanation: string;
  trap: string;
  quiz: Quiz;
  challenge: Challenge;
  recall: Recall;
  /** Optional authored hints; when present they replace the generic tiers. */
  hints: string[];
  /** URL to the language's official docs for this topic. */
  docs: string;
}

/** A learning track (one language), with its lessons already grouped. */
export interface Track {
  name: string;
  short: string;
  tag: string;
  description: string;
  /** Accent colour for track chrome. */
  color: string;
  lessons: Lesson[];
}

/** The two tracks, keyed by language. */
export type Tracks = Record<Lang, Track>;

/** Module names are a flat ordered list; a lesson's `module` indexes into it. */
export type Modules = string[];

/** A "same idea in both languages" comparison card. */
export interface Bridge {
  title: string;
  /** JavaScript rendition of the idea. */
  js: string;
  /** C# rendition of the same idea. */
  cs: string;
  note: string;
}

/** One weighted criterion in a project's self-assessment rubric. */
export interface RubricCriterion {
  label: string;
  weight: number;
}

/** A project's pass rule: percentage of criterion weight needed to pass. */
export interface Rubric {
  /** Pass threshold as a percentage (defaults to 80 in `rubricScore`). */
  pass: number;
  criteria: RubricCriterion[];
}

/** A "trap → fix" pitfall pairing shown in a project brief. */
export interface Pitfall {
  trap: string;
  fix: string;
}

/** A build-it-yourself project (assessed by self-rubric, not autograded). */
export interface Project {
  id: string;
  lang: Lang;
  level: string;
  title: string;
  summary: string;
  time: string;
  skills: string[];
  brief: string;
  steps: string[];
  stretch: string;
  pitfalls: Pitfall[];
  starter: string;
  resources: string;
  rubric: Rubric;
}

/**
 * The result of running learner code, as returned by the JS/C# runner hooks
 * (built in later steps). Defined here so the runner and the lesson UI share one
 * contract. `checks` mirrors a lesson's `challenge.tests`, one entry each.
 */
export interface RunResult {
  ok: boolean;
  /** Captured stdout / console output. */
  output: string;
  /** Populated when the run threw or failed to compile. */
  error?: string;
  checks: {
    label: string;
    passed: boolean;
    expected?: unknown;
    actual?: unknown;
  }[];
}
