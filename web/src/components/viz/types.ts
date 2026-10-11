// Shared shape for the Forge visualization system (Phase 4H). A visualization is
// a short, data-driven sequence of steps the learner can page through (keyboard
// or buttons); each step narrates itself for screen readers and can highlight a
// line of code and/or show a snapshot of named values.
export type TraceVar = {
  name: string;
  value: string;
  /** Optional type label, e.g. "string", "int" — powers the "types are a contract" view. */
  type?: string;
};

export type TraceStep = {
  /** Plain-language narration for this step. Announced via aria-live. */
  caption: string;
  /** 1-based line in the code block to highlight (CodeTracer only). */
  line?: number;
  /** Optional extra detail shown under the caption. */
  note?: string;
  /** Optional snapshot of named values after this step. */
  vars?: TraceVar[];
};

export type PipelineStage = {
  label: string;
  /** One-line description of what happens at this stage. */
  detail: string;
};
