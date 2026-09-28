// Progress types. The `state` blob is intentionally loose: its authoritative shape
// lives in repo-root public/core.js (`freshState`/`sanitizeState`) and must not be
// duplicated here. We only need enough structure to move it between the client,
// the API route, and the JSONB column without reshaping it.

export type ProgressState = Record<string, unknown>;

// A typed READ-ONLY view of the progress blob, mirroring core.js `freshState()`.
// This is a rendering convenience for the learning surface only — it does NOT
// replace `ProgressState` above (which stays the loose transport type that moves
// unreshaped between client, API route and JSONB column). The merge/sanitise
// rules still live solely in core.js; this only documents the fields the UI reads.
// Cast through it deliberately (`state as unknown as ForgeState`) at the seams.
export interface ForgeState {
  version: 1;
  /** Completed lesson ids. */
  completed: string[];
  /** lessonId → true once its quiz is answered correctly (only `true` is stored). */
  quizzes: Record<string, boolean>;
  /** Ids of lessons whose challenge is solved. */
  solved: string[];
  /** lessonId → in-progress editor draft. */
  drafts: Record<string, string>;
  /** lessonId → learner note. */
  notes: Record<string, string>;
  /** lessonId → spaced-repetition card. */
  reviews: Record<string, { count: number; interval: number; due: number }>;
  /** dayKey → truthy marker that the day had activity (feeds `streak`). */
  activity: Record<string, unknown>;
  /** projectId → checked rubric criterion indices. */
  projectChecks: Record<string, number[]>;
  /** lessonId → highest hint tier unlocked. */
  hints: Record<string, number>;
  /** projectId → last rubric result. */
  rubrics: Record<string, unknown>;
  /** lang ("js"|"cs") → epoch-ms the track certificate was first earned. */
  certificates: Record<string, number>;
  /** Name printed on certificates. */
  certName: string;
  /** Last lesson id opened, for "resume". */
  lastLesson: string | null;
  /** Daily focus goal, minutes. */
  goal: number;
  focusSeconds: number;
  /** dayKey → focus seconds that day. */
  focusByDay: Record<string, number>;
  focusTimer: { remainingMs: number; accountedAt: number | null };
  onboarded: boolean;
  /** Epoch-ms of last export. */
  lastExport: number;
}

// A single field-level change, as produced by core.js `progressChanges` and
// validated by `sanitizeChanges`. Kept structural rather than exhaustive.
export interface ProgressChange {
  path: [string] | [string, string];
  before?: unknown;
  value?: unknown;
  add?: boolean;
  append?: string;
  step?: number;
}

// The shape of a row in the `progress` table.
export interface ProgressRow {
  user_id: string;
  state: ProgressState;
  revision: number;
  updated_at: string;
}
