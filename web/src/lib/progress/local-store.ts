"use client";

// Durability layer for the React progress store — the multi-tab coordination and
// corruption-recovery machinery that public/progress-store.js has and the first
// cut of useProgress.tsx deliberately deferred. This owns ONLY local persistence:
// backup slots, decode-with-fallback reads, and lock-guarded writes that stamp a
// `_generation` epoch so a record written by a vanilla tab and one written here
// stay interoperable. Server sync stays in useProgress.tsx / sync-client.ts.
//
// The merge rules (progressChanges/applyProgressChanges) come from core.js — the
// single source of truth shared with the vanilla store and the Node sync service.
import {
  STORAGE_KEY,
  freshState,
  validateProgress,
  sanitizeState,
  progressChanges,
  applyProgressChanges,
} from "./core";
import type { ProgressState, ProgressChange } from "./state";

// Backup key suffixes match public/progress-store.js exactly so records written by
// either implementation interoperate and recover from the same slots.
export const BACKUP_KEY = STORAGE_KEY + ".recovery";
export const IMPORT_BACKUP_KEY = STORAGE_KEY + ".before-import";
// Written just before a first-contact account merge, so the exact record this
// device held before its progress was combined with an account stays downloadable.
export const BEFORE_SYNC_KEY = STORAGE_KEY + ".before-sync";
const BACKUP_KEYS: Record<string, string> = {
  recovery: BACKUP_KEY,
  "before-import": IMPORT_BACKUP_KEY,
  "before-sync": BEFORE_SYNC_KEY,
};
const LOCK = STORAGE_KEY + ".write";

type Generation = string | null;
interface Decoded {
  state: ProgressState;
  generation: string;
}
interface LoadResult extends Decoded {
  raw: string | null;
}

/** The public surface the hook and sync-client drive. Durability only — no server. */
export interface LocalStore {
  readonly state: ProgressState;
  readonly problem: string;
  readonly recovered: boolean;
  readonly generation: Generation;
  readonly lastSaved: number | null;
  readonly unsaved: boolean;
  /** Persist an edited snapshot: diff → merge under the lock → write with a backup. */
  save(next: ProgressState): Promise<boolean>;
  /** Re-read the record another tab wrote and republish it (the storage-event path). */
  sync(): Promise<boolean>;
  /** Persist a server-authoritative snapshot (adopt/push) with a fresh epoch. */
  write(next: ProgressState): Promise<ProgressState | false>;
  /** Import a record, snapshotting the prior one to `.before-import` first. */
  replace(next: ProgressState): Promise<boolean>;
  /** Copy the on-disk record to `.before-sync` before a first-contact merge. */
  snapshotBeforeSync(): void;
  backup(which?: string): string | null;
  settled(): Promise<unknown>;
}

interface StoreOptions {
  storage?: () => Storage;
  locks?: LockManager | null;
  onChange?: (next: ProgressState, prev: ProgressState) => void;
  onStatus?: (message: string) => void;
}

const clone = <T>(value: T): T => structuredClone(value);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function createLocalStore({
  storage = () => localStorage,
  locks = globalThis.navigator?.locks ?? null,
  onChange = () => {},
  onStatus = () => {},
}: StoreOptions = {}): LocalStore {
  let view: ProgressState = freshState();
  let generation: Generation = "legacy";
  let pending: ProgressChange[] = [];
  let chain: Promise<unknown> = Promise.resolve();
  let blocked = false;
  let blockReason = "";
  let recovered = false;
  let problem = "";
  // When the record last reached storage. Kept out of the saved state on purpose:
  // a stored timestamp would make every write dirty the record again.
  let lastSaved: number | null = null;

  function report(message = "") {
    problem = message;
    onStatus(message);
  }
  function decode(raw: string): Decoded {
    const value = JSON.parse(raw) as { _generation?: string };
    return { state: validateProgress(value), generation: value._generation || "legacy" };
  }
  function read(): LoadResult {
    const raw = storage().getItem(STORAGE_KEY);
    if (raw !== null) {
      try {
        const result = decode(raw);
        recovered = false;
        return { ...result, raw };
      } catch {
        /* Try the last good backup. */
      }
    }
    for (const key of [BACKUP_KEY, IMPORT_BACKUP_KEY]) {
      const backup = storage().getItem(key);
      if (backup !== null) {
        try {
          const result = decode(backup);
          recovered = true;
          return { ...result, raw: backup };
        } catch {
          /* A different recovery copy may still be usable. */
        }
      }
    }
    if (raw !== null) {
      const error = new Error(
        "Saved progress is damaged and no recovery copy is available. Export this tab’s work, then import a valid backup.",
      );
      error.name = "ProgressCorruptError";
      throw error;
    }
    return { state: freshState(), generation: "legacy", raw: null };
  }

  try {
    const loaded = read();
    view = loaded.state;
    generation = loaded.generation;
    if (recovered) problem = "Progress recovered from the automatic backup. Export a copy in Settings.";
  } catch (error) {
    const e = error as Error;
    blocked = e.name === "ProgressCorruptError";
    generation = null;
    problem = blockReason = e.message;
  }
  if (!locks?.request)
    problem = "Safe saving is unavailable in this browser. Use a current browser and export your work before closing.";

  function publish(next: ProgressState) {
    const previous = view;
    view = clone(next);
    if (!same(view, previous)) onChange(clone(view), clone(previous));
  }
  function encode(state: ProgressState, epoch: string) {
    return JSON.stringify({ ...state, _generation: epoch });
  }
  function withLock<T>(work: () => T): Promise<T> {
    return (locks as LockManager).request(LOCK, work as () => Promise<T>) as Promise<T>;
  }
  async function flush(): Promise<boolean> {
    if (!locks?.request)
      throw new Error("Safe saving is unavailable. Export your progress before closing this tab.");
    if (blocked) throw new Error(blockReason);
    return withLock(() => {
      const latest = read();
      if (generation === null) generation = latest.generation;
      if (latest.generation !== generation)
        throw new Error(
          "Progress was restored in another tab. Export this tab’s work before reloading to use the restored version.",
        );
      const next = applyProgressChanges(latest.state, pending, true);
      if (pending.length || recovered || !same(next, latest.state)) {
        // Preserve a valid previous save before writing. If either write fails,
        // retain the local edits and report that they have not been saved.
        storage().setItem(BACKUP_KEY, latest.raw || encode(next, generation));
        storage().setItem(STORAGE_KEY, encode(next, generation));
        lastSaved = Date.now();
        pending = [];
        recovered = false;
      }
      publish(next);
      report();
      return true;
    });
  }
  function queue(work: () => Promise<unknown>): Promise<unknown> {
    chain = chain.then(work).catch((error: Error & { name?: string }) => {
      report(
        error.message === "Quota exceeded" || error.name === "QuotaExceededError"
          ? "Browser storage is full. Your latest changes are only in this tab. Export progress before closing."
          : error.message || "Progress could not be saved. Export it before closing this tab.",
      );
      return false;
    });
    return chain;
  }

  return {
    get state() {
      return clone(view);
    },
    get problem() {
      return problem;
    },
    get recovered() {
      return recovered;
    },
    get generation() {
      return generation;
    },
    get lastSaved() {
      return lastSaved;
    },
    get unsaved() {
      return pending.length > 0;
    },
    save(next: ProgressState) {
      pending.push(...progressChanges(view, next));
      view = clone(next);
      if (!pending.length && !recovered) return chain as Promise<boolean>;
      report("Saving progress…");
      return queue(() => flush()) as Promise<boolean>;
    },
    sync() {
      return queue(async () => {
        if (pending.length) return flush();
        const latest = read();
        generation = latest.generation;
        publish(latest.state);
        if (!blocked && locks?.request)
          report(recovered ? "Progress recovered from the automatic backup. Export a copy in Settings." : "");
        return true;
      }) as Promise<boolean>;
    },
    write(next: ProgressState) {
      const clean = sanitizeState(next);
      return queue(async () => {
        if (!locks?.request)
          throw new Error("Safe saving is unavailable. Export your progress before closing this tab.");
        return withLock(() => {
          const epoch = crypto.randomUUID();
          storage().setItem(STORAGE_KEY, encode(clean, epoch));
          generation = epoch;
          lastSaved = Date.now();
          pending = [];
          recovered = false;
          blocked = false;
          publish(clean);
          report();
          return clean;
        });
      }) as Promise<ProgressState | false>;
    },
    replace(next: ProgressState) {
      const replacement = sanitizeState(next) as ProgressState & {
        focusTimer?: { accountedAt: number | null };
      };
      // A backup may contain an old running timer. Resume only on explicit Start.
      if (replacement.focusTimer) replacement.focusTimer.accountedAt = null;
      return queue(async () => {
        if (!locks?.request) throw new Error("Safe saving is unavailable. Import was not applied.");
        return withLock(() => {
          // Keep the old raw record even if damaged, so import cannot erase the only
          // remaining copy. A failed import leaves the current view intact.
          const raw = storage().getItem(STORAGE_KEY);
          const epoch = crypto.randomUUID();
          if (raw !== null) storage().setItem(IMPORT_BACKUP_KEY, raw);
          storage().setItem(STORAGE_KEY, encode(replacement, epoch));
          generation = epoch;
          lastSaved = Date.now();
          pending = [];
          blocked = false;
          recovered = false;
          publish(replacement);
          report();
          return true;
        });
      }) as Promise<boolean>;
    },
    snapshotBeforeSync() {
      try {
        const raw = storage().getItem(STORAGE_KEY);
        if (raw !== null) storage().setItem(BEFORE_SYNC_KEY, raw);
      } catch {
        /* Best effort — a full disk must not block sign-in. */
      }
    },
    backup(which = "recovery") {
      return storage().getItem(BACKUP_KEYS[which] || BACKUP_KEY);
    },
    settled() {
      return chain;
    },
  };
}

// The provider creates the one instance for the tab and registers it here so
// sync-client's server-authoritative writes (adopt/push results) persist through
// the same lock chain and `_generation` envelope rather than a bare setItem.
let current: LocalStore | null = null;
export function setLocalStore(store: LocalStore) {
  current = store;
}
export function getLocalStore(): LocalStore {
  if (!current) current = createLocalStore();
  return current;
}
