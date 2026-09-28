"use client";

// The React re-shell of the vanilla studio's progress-store.js. Same local-first
// contract: signed-out learners live entirely in localStorage with zero network;
// signing in merges the device snapshot into the account (idempotent adopt) and
// thereafter every edit persists locally first, then pushes the delta to the
// server. One instance is shared across the /learn surface via context, so a
// change on the lesson page is instantly visible on the Overview.
//
// Deferred from progress-store.js (tracked for the pre-cutover hardening pass):
// multi-tab Web Locks coordination and the corruption-recovery backup copies.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { freshState, toState } from "./core";
import {
  readLocalState,
  writeLocalState,
  adoptLocalProgress,
  pushChanges,
} from "./sync-client";
import type { ForgeState, ProgressState } from "./state";

/** loading → first paint; then local-only, or the sync lifecycle when signed in. */
export type SyncStatus = "loading" | "local" | "syncing" | "synced" | "error";

interface ProgressContextValue {
  /** The live, fully-shaped progress state. Always safe to read every field. */
  state: ForgeState;
  signedIn: boolean;
  status: SyncStatus;
  /** False until the initial local read (and, when signed in, the merge) settles. */
  ready: boolean;
  /** Apply a pure update; persists locally at once and syncs (debounced) when signed in. */
  update: (updater: (prev: ForgeState) => ForgeState) => void;
}

const ProgressContext = createContext<ProgressContextValue | null>(null);

const asForge = (raw: ProgressState): ForgeState =>
  toState(raw) as unknown as ForgeState;

const SYNC_DEBOUNCE_MS = 700;

export function ProgressProvider({
  signedIn,
  children,
}: {
  signedIn: boolean;
  children: React.ReactNode;
}) {
  const [state, setState] = useState<ForgeState>(
    () => freshState() as unknown as ForgeState,
  );
  const [status, setStatus] = useState<SyncStatus>("loading");
  const [ready, setReady] = useState(false);

  // Refs mirror the latest values so `update` and the debounced push can read them
  // without stale closures, and side effects stay out of the state updater.
  const stateRef = useRef<ForgeState>(state);
  const baselineRef = useRef<ForgeState>(state); // last state the server has confirmed
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const commit = useCallback((next: ForgeState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  // Initial load: local snapshot first (instant, offline), then merge up if signed in.
  useEffect(() => {
    const local = asForge(readLocalState());
    commit(local);
    baselineRef.current = local;

    if (!signedIn) {
      setStatus("local");
      setReady(true);
      return;
    }

    let cancelled = false;
    setStatus("syncing");
    // adopt is a safe superset of pull: it unions local into the account (never
    // doubling counters) and returns the canonical merged state, so an offline
    // device that comes back never loses the work it did while signed out.
    adoptLocalProgress()
      .then((merged) => {
        if (cancelled) return;
        if (merged) {
          const full = asForge(merged);
          commit(full);
          baselineRef.current = full;
          setStatus("synced");
        } else {
          // Network/auth hiccup — keep the local view working, flag the state.
          setStatus("error");
        }
        setReady(true);
      })
      .catch(() => {
        if (cancelled) return;
        setStatus("error");
        setReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, [signedIn, commit]);

  const scheduleSync = useCallback(() => {
    if (!signedIn) return;
    setStatus("syncing");
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      const before = baselineRef.current as unknown as ProgressState;
      const current = stateRef.current as unknown as ProgressState;
      const server = await pushChanges(before, current);
      if (server) {
        // Advance the baseline to what the server confirmed. We keep the local
        // view as-is (it is already sanitised) so an edit made mid-flight is not
        // clobbered — the next push sends its delta against this new baseline.
        baselineRef.current = asForge(server);
        setStatus("synced");
      } else {
        setStatus("error");
      }
    }, SYNC_DEBOUNCE_MS);
  }, [signedIn]);

  const update = useCallback(
    (updater: (prev: ForgeState) => ForgeState) => {
      const next = asForge(updater(stateRef.current) as unknown as ProgressState);
      commit(next);
      writeLocalState(next as unknown as ProgressState); // local-first: never lose work
      scheduleSync();
    },
    [commit, scheduleSync],
  );

  return (
    <ProgressContext.Provider value={{ state, signedIn, status, ready, update }}>
      {children}
    </ProgressContext.Provider>
  );
}

/** Read the shared progress state and its mutator. Must be inside <ProgressProvider>. */
export function useProgress(): ProgressContextValue {
  const ctx = useContext(ProgressContext);
  if (!ctx)
    throw new Error("useProgress must be used within a <ProgressProvider>.");
  return ctx;
}
