// The single source of truth for progress-merge rules lives in repo-root
// public/core.js — shared by the browser store, the legacy Node sync service, and
// now this Next app. The codebase deliberately keeps ONE copy of these rules so the
// two sides can never drift (see the comment block above `progressChanges` there).
// We import that exact module rather than re-implementing it. Enabled by the
// `externalDir` option in next.config.ts. These functions use `structuredClone`, so
// any route importing them must run on the Node.js runtime (not Edge).
import * as coreJs from "../../../../public/core.js";
import type { ProgressState, ProgressChange } from "./state";

const core = coreJs as unknown as {
  STORAGE_KEY: string;
  freshState: () => ProgressState;
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
};

export const STORAGE_KEY = core.STORAGE_KEY;
export const freshState = core.freshState;
export const sanitizeState = core.sanitizeState;
export const sanitizeChanges = core.sanitizeChanges;
export const applyProgressChanges = core.applyProgressChanges;
export const progressChanges = core.progressChanges;
export const adoptState = core.adoptState;
export const DEVICE_LOCAL = core.DEVICE_LOCAL;

export type { ProgressState, ProgressChange } from "./state";
