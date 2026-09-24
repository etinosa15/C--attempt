import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  sanitizeChanges,
  sanitizeState,
  applyProgressChanges,
  freshState,
} from "@/lib/progress/core";
import type { ProgressState } from "@/lib/progress/state";

// core.js uses structuredClone → Node runtime, not Edge.
export const runtime = "nodejs";

const MAX_RETRIES = 5;

// GET /api/progress — the learner's current server state + revision.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in to sync your progress." }, { status: 401 });

  const { data, error } = await supabase
    .from("progress")
    .select("state, revision")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: "Could not read progress." }, { status: 500 });

  const state = data ? sanitizeState(data.state) : freshState();
  return NextResponse.json({ state, revision: data?.revision ?? 0 });
}

// POST /api/progress — replay field-level changes onto the row. This is the port of
// the legacy sync service's /api/sync: same core.js merge rules, but the file
// store's per-key lock is replaced by optimistic concurrency on `revision` (the DB
// trigger bumps it on every write) with a bounded retry, so two devices writing at
// once can't clobber each other.
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in to sync your progress." }, { status: 401 });

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const changes = sanitizeChanges((payload as { changes?: unknown })?.changes);

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const { data: current, error: readErr } = await supabase
      .from("progress")
      .select("state, revision")
      .eq("user_id", user.id)
      .maybeSingle();
    if (readErr) return NextResponse.json({ error: "Could not read progress." }, { status: 500 });

    const baseState: ProgressState = current ? sanitizeState(current.state) : freshState();
    const baseRevision = current?.revision ?? 0;

    let next: ProgressState;
    try {
      next = sanitizeState(applyProgressChanges(baseState, changes));
    } catch {
      next = baseState; // conflict guard is off server-side; keep the saved state.
    }

    // Optimistic write: only lands if nobody else bumped the revision meanwhile.
    if (current) {
      const { data: updated, error: updErr } = await supabase
        .from("progress")
        .update({ state: next })
        .eq("user_id", user.id)
        .eq("revision", baseRevision)
        .select("state, revision")
        .maybeSingle();
      if (updErr) return NextResponse.json({ error: "Could not save progress." }, { status: 500 });
      if (updated)
        return NextResponse.json({ state: updated.state, revision: updated.revision, applied: changes.length });
      continue; // someone else won the race — re-read and replay.
    } else {
      const { data: inserted, error: insErr } = await supabase
        .from("progress")
        .insert({ user_id: user.id, state: next, revision: 0 })
        .select("state, revision")
        .maybeSingle();
      if (!insErr && inserted)
        return NextResponse.json({ state: inserted.state, revision: inserted.revision, applied: changes.length });
      continue; // row appeared concurrently — retry as an update.
    }
  }

  return NextResponse.json({ error: "Progress is being updated elsewhere; try again." }, { status: 409 });
}
