import type { SupabaseClient } from "@supabase/supabase-js";
import { sanitizeState, applyProgressChanges, toState } from "./core";
import type { ProgressChange, ProgressState } from "./state";

// Shared progress read/merge, used by BOTH the Next-native /api/progress route and
// the legacy-protocol /api/sync adapter, so the two can never drift. The merge rules
// themselves live in repo-root public/core.js (imported via core.ts). structuredClone
// inside those functions requires the Node.js runtime on any calling route.

const MAX_RETRIES = 5;

export type ProgressResult =
  | { ok: true; state: ProgressState; revision: number; applied?: number }
  | { ok: false; status: number; error: string };

// The learner's current server state + revision. Missing/empty/non-v1 rows (a freshly
// seeded account, a brand-new device) coerce to a fresh state via toState.
export async function readProgress(supabase: SupabaseClient, userId: string): Promise<ProgressResult> {
  const { data, error } = await supabase
    .from("progress")
    .select("state, revision")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return { ok: false, status: 500, error: "Could not read progress." };
  return { ok: true, state: toState(data?.state), revision: data?.revision ?? 0 };
}

// Replay field-level changes onto the row under optimistic concurrency on `revision`
// (the DB trigger bumps it on every write), with a bounded retry so two devices
// writing at once cannot clobber each other.
export async function applyChanges(
  supabase: SupabaseClient,
  userId: string,
  changes: ProgressChange[],
): Promise<ProgressResult> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const { data: current, error: readErr } = await supabase
      .from("progress")
      .select("state, revision")
      .eq("user_id", userId)
      .maybeSingle();
    if (readErr) return { ok: false, status: 500, error: "Could not read progress." };

    const baseState: ProgressState = toState(current?.state);
    const baseRevision = current?.revision ?? 0;

    let next: ProgressState;
    try {
      next = sanitizeState(applyProgressChanges(baseState, changes));
    } catch {
      next = baseState; // conflict guard is off server-side; keep the saved state.
    }

    if (current) {
      const { data: updated, error: updErr } = await supabase
        .from("progress")
        .update({ state: next })
        .eq("user_id", userId)
        .eq("revision", baseRevision)
        .select("state, revision")
        .maybeSingle();
      if (updErr) return { ok: false, status: 500, error: "Could not save progress." };
      if (updated) return { ok: true, state: updated.state, revision: updated.revision, applied: changes.length };
      continue; // someone else won the race — re-read and replay.
    } else {
      const { data: inserted, error: insErr } = await supabase
        .from("progress")
        .insert({ user_id: userId, state: next, revision: 0 })
        .select("state, revision")
        .maybeSingle();
      if (!insErr && inserted)
        return { ok: true, state: inserted.state, revision: inserted.revision, applied: changes.length };
      continue; // row appeared concurrently — retry as an update.
    }
  }
  return { ok: false, status: 409, error: "Progress is being updated elsewhere; try again." };
}
