// Typed re-export of the focus reducer that lives in repo-root public/focus.js —
// the same pure, timestamp-based accounting the vanilla studio and the legacy sync
// service use. As with progress/core.ts we import the exact module rather than
// re-implementing it (enabled by `externalDir` in next.config.ts), so the two
// surfaces can never drift. `advanceFocus` credits elapsed time to the day/lifetime
// totals and advances the countdown; `dailyFocus` projects a read-only view for the
// current instant without persisting anything.
import * as focusJs from "../../../../public/focus.js";
import type { ForgeState } from "./state";

/** The four transactions the reducer understands. */
export type FocusAction = "tick" | "start" | "pause" | "reset";

/** What a transaction returns: the next state plus the two completion signals. */
export interface FocusResult {
  state: ForgeState;
  /** True when this transaction drained the current session to zero. */
  completed: boolean;
  /** True when this transaction crossed today's goal for the first time. */
  goalReached: boolean;
}

/** A read-only projection of focus for a given instant (see `dailyFocus`). */
export interface FocusView {
  day: string;
  /** Focus seconds logged today. */
  seconds: number;
  /** Today's goal in seconds. */
  goalSeconds: number;
  /** Seconds still needed to reach today's goal. */
  remainingSeconds: number;
  /** Progress toward today's goal, 0–100. */
  percent: number;
  /** Whether today's goal is met. */
  achieved: boolean;
  /** Whether a session is currently counting down. */
  running: boolean;
  /** Whole seconds left in the current session. */
  remaining: number;
  /** Lifetime focus seconds. */
  totalSeconds: number;
}

const focus = focusJs as unknown as {
  advanceFocus: (state: ForgeState, action?: FocusAction, now?: number) => FocusResult;
  dailyFocus: (state: ForgeState, now?: number) => FocusView;
};

export const advanceFocus = focus.advanceFocus;
export const dailyFocus = focus.dailyFocus;

// The two display formatters mirror public/ui.js (`formatTime`/`focusDuration`).
// They are trivial and pure, so we reproduce them here rather than importing ui.js,
// which is coupled to the vanilla DOM shell.

/** mm:ss for the session countdown. */
export function formatTime(totalSeconds: number): string {
  return (
    String(Math.floor(totalSeconds / 60)).padStart(2, "0") +
    ":" +
    String(totalSeconds % 60).padStart(2, "0")
  );
}

/** "Xm YYs" for accumulated focus time. */
export function focusDuration(seconds: number): string {
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}m ${String(whole % 60).padStart(2, "0")}s`;
}
