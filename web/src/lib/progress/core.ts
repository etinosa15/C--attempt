// The single source of truth for progress-merge rules lives in repo-root
// public/core.js — shared by the browser store, the legacy Node sync service, and
// now this Next app. The codebase deliberately keeps ONE copy of these rules so the
// two sides can never drift (see the comment block above `progressChanges` there).
// We import that exact module rather than re-implementing it. Enabled by the
// `externalDir` option in next.config.ts. These functions use `structuredClone`, so
// any route importing them must run on the Node.js runtime (not Edge).
import * as coreJs from "../../../../public/core.js";
import type { ProgressState, ProgressChange } from "./state";
import type { Rubric } from "../curriculum/types";

/** A spaced-repetition rating, as `scheduleReview` expects. */
export type ReviewRating = "again" | "hard" | "good";
/** A stored review card, as `scheduleReview` returns and `state.reviews` holds. */
export interface ReviewRecord {
  count: number;
  /** Days until next due (0 for an "again" lapse). */
  interval: number;
  /** Epoch-ms timestamp the card next becomes due. */
  due: number;
}
/** One staged hint. A `solution: true` tier reveals the worked answer instead of prose. */
export interface HintTier {
  title: string;
  body?: string;
  solution?: boolean;
}
/** A plain-language translation of a compiler/runtime error, or null if none matched. */
export interface ErrorGuide {
  summary: string;
  hint: string;
}
/** The outcome of scoring a project's self-assessment rubric. */
export interface RubricResult {
  percent: number;
  passed: boolean;
  /** The pass threshold used, as a percentage. */
  pass: number;
}
/** Result of the Enter-key auto-indent helper: new text plus where to place the caret. */
export interface IndentResult {
  text: string;
  caret: number;
}

const core = coreJs as unknown as {
  STORAGE_KEY: string;
  FOCUS_SESSION_MS: number;
  freshFocusTimer: () => { remainingMs: number; accountedAt: number | null };
  freshState: () => ProgressState;
  validateProgress: (raw: unknown) => ProgressState;
  sanitizeState: (raw: unknown) => ProgressState;
  sanitizeChanges: (changes: unknown) => ProgressChange[];
  applyProgressChanges: (
    state: ProgressState,
    changes: ProgressChange[],
    checkConflicts?: boolean,
  ) => ProgressState;
  progressChanges: (before: ProgressState, after: ProgressState) => ProgressChange[];
  adoptState: (account: ProgressState, local: ProgressState) => ProgressState;
  DEVICE_LOCAL: string[];
  // Learning-surface pure helpers — no DOM, no I/O. Rebuilt renderers in
  // web/ call these instead of re-deriving the rules the vanilla studio uses.
  dayKey: (date?: Date) => string;
  streak: (activity: Record<string, unknown>, date?: Date) => number;
  scheduleReview: (
    previous: ReviewRecord | undefined,
    rating: ReviewRating,
    now?: number,
  ) => ReviewRecord;
  escapeHtml: (value: unknown) => string;
  highlight: (code: string, lang: string) => string;
  indentOnEnter: (value: string, start: number, end: number) => IndentResult;
  formatValue: (value: unknown) => string;
  valueKind: (value: unknown) => string;
  typeMismatch: (expected: unknown, actual: unknown) => boolean;
  explainError: (message: string, lang?: "js" | "cs") => ErrorGuide | null;
  hintTiers: (lesson: unknown) => HintTier[];
  certificateEarned: (completed: string[], lessonIds: string[]) => boolean;
  certificateSvg: (opts?: {
    name?: string;
    trackName?: string;
    dateText?: string;
    accent?: string;
  }) => string;
  rubricScore: (rubric: Rubric, checkedIndices?: number[]) => RubricResult;
};

export const STORAGE_KEY = core.STORAGE_KEY;
export const FOCUS_SESSION_MS = core.FOCUS_SESSION_MS;
export const freshFocusTimer = core.freshFocusTimer;
export const freshState = core.freshState;
export const validateProgress = core.validateProgress;
export const sanitizeState = core.sanitizeState;
export const sanitizeChanges = core.sanitizeChanges;
export const applyProgressChanges = core.applyProgressChanges;
export const progressChanges = core.progressChanges;
export const adoptState = core.adoptState;
export const DEVICE_LOCAL = core.DEVICE_LOCAL;

// Learning-surface helpers. NOTE: core.js also exports a two-arg `resolveTheme`,
// but the React app resolves appearance through web/src/lib/theme.ts (which owns
// the localStorage key and the pre-paint boot script); we deliberately do NOT
// re-export core's copy here to keep one theme authority in the app.
export const dayKey = core.dayKey;
export const streak = core.streak;
export const scheduleReview = core.scheduleReview;
export const escapeHtml = core.escapeHtml;
export const highlight = core.highlight;
export const indentOnEnter = core.indentOnEnter;
export const formatValue = core.formatValue;
export const valueKind = core.valueKind;
export const typeMismatch = core.typeMismatch;
export const explainError = core.explainError;
export const hintTiers = core.hintTiers;
export const certificateEarned = core.certificateEarned;
export const certificateSvg = core.certificateSvg;
export const rubricScore = core.rubricScore;

// `sanitizeState` validates strictly (it doubles as the import-file check and throws
// on anything that isn't a versioned Forge state). But two legitimate paths produce a
// bare `{}`: the DB seeds each new learner an empty `{}` progress row (see
// handle_new_user), and a brand-new device has an empty localStorage snapshot. Coerce
// any missing/empty/non-v1 value to a fresh state, and only sanitize what looks real,
// so first-contact sync never 500s.
export function toState(raw: unknown): ProgressState {
  if (!raw || typeof raw !== "object" || (raw as { version?: number }).version !== 1)
    return freshState();
  return sanitizeState(raw);
}

export type { ProgressState, ProgressChange } from "./state";
