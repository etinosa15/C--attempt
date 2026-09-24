"use client";

// Client sync layer. The local-first promise is preserved: signed-out learners use
// localStorage only, with zero network. Signing in triggers a one-time merge of the
// local snapshot into the account (adopt), after which changes flow both ways using
// the same core.js delta rules the legacy app used.
import { STORAGE_KEY, sanitizeState, progressChanges } from "./core";
import type { ProgressState, ProgressChange } from "./state";

// Read the device's localStorage snapshot (the shape core.js writes). Returns an
// empty object if there is nothing stored or it is unparseable.
export function readLocalState(): ProgressState {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? sanitizeState(JSON.parse(raw)) : {};
  } catch {
    return {};
  }
}

// Persist a state snapshot back to localStorage so signed-out use continues offline
// and the next adopt starts from the merged baseline.
export function writeLocalState(state: ProgressState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitizeState(state)));
  } catch {
    // Storage full or blocked — nothing else we can safely do here.
  }
}

// First contact on sign-in: push the local snapshot up so account + device combine
// without doubling counters, then adopt the merged result locally.
export async function adoptLocalProgress(): Promise<ProgressState | null> {
  const local = readLocalState();
  const res = await fetch("/api/progress/adopt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ local }),
  });
  if (!res.ok) return null;
  const { state } = (await res.json()) as { state: ProgressState };
  writeLocalState(state);
  return state;
}

// Pull the server's current state (e.g. on load when signed in).
export async function pullProgress(): Promise<{ state: ProgressState; revision: number } | null> {
  const res = await fetch("/api/progress", { method: "GET" });
  if (!res.ok) return null;
  return (await res.json()) as { state: ProgressState; revision: number };
}

// Push only what changed between two snapshots — the delta, not the whole record —
// so one device never clobbers another's concurrent work.
export async function pushChanges(before: ProgressState, after: ProgressState): Promise<ProgressState | null> {
  const changes: ProgressChange[] = progressChanges(before, after);
  if (changes.length === 0) return after;
  const res = await fetch("/api/progress", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ changes }),
  });
  if (!res.ok) return null;
  const { state } = (await res.json()) as { state: ProgressState };
  writeLocalState(state);
  return state;
}
