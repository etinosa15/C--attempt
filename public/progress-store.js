import { freshState, sanitizeState, validateProgress, STORAGE_KEY, progressChanges, applyProgressChanges } from "./core.js";
import { advanceFocus } from "./focus.js";

// The merge rules live in core.js so the sync service replays exactly what this
// store does. Re-exported here because this has been their import path.
export { progressChanges, applyProgressChanges };

export const BACKUP_KEY = STORAGE_KEY + ".recovery";
export const IMPORT_BACKUP_KEY = STORAGE_KEY + ".before-import";
// Written just before a first-contact account merge, so the exact record this
// device held before its progress was combined with an account stays downloadable.
export const BEFORE_SYNC_KEY = STORAGE_KEY + ".before-sync";
const BACKUP_KEYS = { recovery: BACKUP_KEY, "before-import": IMPORT_BACKUP_KEY, "before-sync": BEFORE_SYNC_KEY };
const LOCK = STORAGE_KEY + ".write";
const clone = (value) => structuredClone(value);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function decode(raw) {
  const value = JSON.parse(raw);
  return { state: validateProgress(value), generation: value._generation || "legacy" };
}

export function createProgressStore({
  storage = () => localStorage,
  locks = globalThis.navigator?.locks,
  onChange = () => {},
  onStatus = () => {},
} = {}) {
  let view = freshState();
  let generation = "legacy";
  let pending = [];
  let chain = Promise.resolve();
  let blocked = false;
  let blockReason = "";
  let recovered = false;
  let problem = "";
  // When the record last reached storage. Kept out of the saved state on
  // purpose: a stored timestamp would make every write dirty the record again.
  let lastSaved = null;
  function report(message = "") { problem = message; onStatus(message); }
  function read() {
    const raw = storage().getItem(STORAGE_KEY);
    if (raw !== null) {
      try {
        const result = decode(raw);
        recovered = false;
        return { ...result, raw };
      } catch { /* Try the last good backup. */ }
    }
    for (const key of [BACKUP_KEY, IMPORT_BACKUP_KEY]) {
      const backup = storage().getItem(key);
      if (backup !== null) {
        try {
          const result = decode(backup);
          recovered = true;
          return { ...result, raw: backup };
        } catch { /* A different recovery copy may still be usable. */ }
      }
    }
    if (raw !== null) {
      const error = new Error("Saved progress is damaged and no recovery copy is available. Export this tab’s work, then import a valid backup.");
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
    blocked = error.name === "ProgressCorruptError";
    generation = null;
    problem = blockReason = error.message;
  }
  if (!locks?.request) problem = "Safe saving is unavailable in this browser. Use a current browser on localhost and export your work before closing.";

  function publish(next) {
    const previous = view;
    view = clone(next);
    if (!same(view, previous)) onChange(clone(view), clone(previous));
  }
  function encode(state, epoch) {
    return JSON.stringify({ ...state, _generation: epoch });
  }
  async function flush(focusAction, now) {
    if (!locks?.request) throw new Error("Safe saving is unavailable. Export your progress before closing this tab.");
    if (blocked) throw new Error(blockReason);
    return locks.request(LOCK, () => {
      const latest = read();
      if (generation === null) generation = latest.generation;
      if (latest.generation !== generation)
        throw new Error("Progress was restored in another tab. Export this tab’s work before reloading to use the restored version.");
      let next = applyProgressChanges(latest.state, pending, true);
      const focusResult = focusAction ? advanceFocus(next, focusAction, now) : null;
      if (focusResult) next = focusResult.state;
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
      return focusResult || true;
    });
  }
  function queue(work) {
    chain = chain.then(work).catch(error => {
      report(error.message === "Quota exceeded" || error.name === "QuotaExceededError"
        ? "Browser storage is full. Your latest changes are only in this tab. Export progress before closing."
        : error.message || "Progress could not be saved. Export it before closing this tab.");
      return false;
    });
    return chain;
  }
  return {
    get state() { return clone(view); },
    get problem() { return problem; },
    get unsaved() { return pending.length > 0; },
    get recovered() { return recovered; },
    get lastSaved() { return lastSaved; },
    save(next) {
      pending.push(...progressChanges(view, next));
      view = clone(next);
      if (!pending.length && !recovered) return chain;
      report("Saving progress…");
      return queue(() => flush());
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
      });
    },
    focus(action = "tick", now = Date.now()) {
      return queue(() => flush(action, now));
    },
    replace(next) {
      const replacement = sanitizeState(next);
      // A backup may contain an old running timer. Resume only on explicit Start.
      replacement.focusTimer.accountedAt = null;
      return queue(async () => {
        if (!locks?.request) throw new Error("Safe saving is unavailable. Import was not applied.");
        return locks.request(LOCK, () => {
          // Keep the old raw record even if damaged, so import cannot erase the
          // only remaining copy. A failed import leaves the current view intact.
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
      });
    },
    backup(which = "recovery") { return storage().getItem(BACKUP_KEYS[which] || BACKUP_KEY); },
    settled() { return chain; },
  };
}
