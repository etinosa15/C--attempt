"use client";

// The focus-timer controller — the React re-shell of the vanilla studio's
// checkpointFocus + the 1s setInterval tick loop (public/app.js). It ticks the
// display every second while a session runs, checkpoints the accrued time through
// the shared progress store roughly every 15 seconds (and the instant a session
// ends), and exposes start/pause/reset plus the same button label the vanilla
// aside shows. All accounting stays in the pure reducer (progress/focus.ts); this
// hook only decides *when* to apply a transaction and surfaces completion.
import { useCallback, useEffect, useRef, useState } from "react";
import { useProgress } from "./useProgress";
import { advanceFocus, dailyFocus, type FocusView } from "./focus";

// Mirrors the vanilla checkpoint cadence: flush at most ~15s of drift at a time.
const CHECKPOINT_MS = 15000;
// A 25-minute session, in seconds (FOCUS_SESSION_MS / 1000). Below this, the timer
// has been touched, so the label offers "Resume" rather than "Start".
const SESSION_SECONDS = 1500;
// How long a completion announcement lingers before it clears.
const ANNOUNCE_MS = 6000;

export interface FocusController {
  focus: FocusView;
  /** Start/pause button label, matching the vanilla focusButtonLabel. */
  buttonLabel: string;
  /** Transient completion message for an aria-live region; null when idle. */
  announcement: string | null;
  toggle: () => void;
  reset: () => void;
}

export function useFocus(): FocusController {
  const { state, update } = useProgress();
  const [now, setNow] = useState(() => Date.now());
  const [announcement, setAnnouncement] = useState<string | null>(null);
  const checkpointAt = useRef(Date.now());

  const focus = dailyFocus(state, now);

  // Apply a focus transaction through the shared store, then surface completion —
  // the React equivalent of checkpointFocus (save + progressStore.focus + toast).
  // There is no toast/buddy system in the port yet, so completion is announced
  // inline via an aria-live region and reflected in the button label.
  const checkpoint = useCallback(
    (action: "tick" | "start" | "pause" | "reset") => {
      let result: ReturnType<typeof advanceFocus> | null = null;
      update((prev) => {
        result = advanceFocus(prev, action);
        return result.state;
      });
      checkpointAt.current = Date.now();
      if (result) {
        const { completed, goalReached } = result as { completed: boolean; goalReached: boolean };
        if (goalReached && completed)
          setAnnouncement("Daily goal reached and focus session complete. Time for a break!");
        else if (goalReached)
          setAnnouncement("Daily focus goal reached. Well done keeping your commitment.");
        else if (completed)
          setAnnouncement("Focus session complete. Stand up, stretch, and take a break.");
      }
    },
    [update],
  );

  // Per-second display tick while a session runs; also drives the periodic
  // checkpoint and the end-of-session flush, mirroring the vanilla setInterval.
  // `now` is not a dependency, so this re-arms only when the session starts/stops
  // or a checkpoint changes `state` — the ticks themselves don't tear it down.
  useEffect(() => {
    if (!focus.running) return;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      const live = dailyFocus(state, t);
      if (t - checkpointAt.current >= CHECKPOINT_MS || live.remaining === 0)
        checkpoint("tick");
    }, 1000);
    return () => clearInterval(id);
  }, [focus.running, state, checkpoint]);

  // Reconcile time credited while the tab was closed: if the stored timer is still
  // "running" but the projection shows it stopped (the session fully elapsed while
  // away), flush once so the day and lifetime totals catch up. Idempotent — the
  // flush clears accountedAt, so this cannot loop.
  useEffect(() => {
    if (state.focusTimer.accountedAt !== null && !focus.running) checkpoint("tick");
  }, [state.focusTimer.accountedAt, focus.running, checkpoint]);

  // Let a completion message fade on its own.
  useEffect(() => {
    if (!announcement) return;
    const id = setTimeout(() => setAnnouncement(null), ANNOUNCE_MS);
    return () => clearTimeout(id);
  }, [announcement]);

  const toggle = useCallback(() => {
    checkpoint(dailyFocus(state, Date.now()).running ? "pause" : "start");
  }, [checkpoint, state]);
  const reset = useCallback(() => checkpoint("reset"), [checkpoint]);

  const buttonLabel = focus.running
    ? "Pause session"
    : focus.remaining === 0
      ? "Start another session"
      : focus.remaining < SESSION_SECONDS
        ? "Resume session"
        : "Start focus session";

  return { focus, buttonLabel, announcement, toggle, reset };
}
