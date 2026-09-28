// Local-file backups — the browser-specific half of the vanilla studio's
// export/import/reset controls (public/app.js export handler + import-file change
// + reset). Progress is local-first, and browser storage can be cleared out from
// under a learner, so a downloadable JSON copy is how work survives that and how it
// moves between the website and the local edition (they keep separate storage).
//
// This module owns only the file I/O and validation; the Settings screen decides
// *when* to replace state (confirm dialogs) and stamps `lastExport`, applying the
// result through the shared progress store's `update`.
import { dayKey, validateProgress } from "./core";
import type { ForgeState, ProgressState } from "./state";

// Mirrors the vanilla import guard: a real progress backup is far smaller, so a
// larger file is almost certainly the wrong one and we reject it before parsing.
const MAX_BACKUP_BYTES = 5_000_000;

// Trigger a download of `data` as pretty-printed JSON, then release the blob URL.
function downloadJson(data: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Download a progress snapshot as `forge-progress-<day>.json` (or a labelled
 * variant, e.g. the pre-reset safety copy). Pure download — the caller is
 * responsible for stamping `state.lastExport` through the store.
 */
export function downloadProgress(state: ForgeState, prefix = "forge-progress"): void {
  downloadJson(state, `${prefix}-${dayKey()}.json`);
}

/**
 * Read and strictly validate a learner-selected backup file. Throws on an oversize
 * file, malformed JSON, or content `validateProgress` rejects — the caller shows
 * the message and leaves current progress untouched. Returns the sanitised state
 * ready to hand straight to `update(() => imported)`.
 */
export async function readBackupFile(file: File): Promise<ProgressState> {
  if (file.size > MAX_BACKUP_BYTES) throw new Error("Backup exceeds the 5 MB limit.");
  return validateProgress(JSON.parse(await file.text()));
}
