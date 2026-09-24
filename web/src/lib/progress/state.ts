// Progress types. The `state` blob is intentionally loose: its authoritative shape
// lives in repo-root public/core.js (`freshState`/`sanitizeState`) and must not be
// duplicated here. We only need enough structure to move it between the client,
// the API route, and the JSONB column without reshaping it.

export type ProgressState = Record<string, unknown>;

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
