import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { readProgress, applyChanges } from "@/lib/progress/handlers";
import { sanitizeChanges } from "@/lib/progress/core";

// Next-native progress endpoint used by the React app (cookie session). Shares the
// exact read/merge logic with the legacy /api/sync adapter via handlers.ts, so the
// two surfaces can never drift. core.js merge uses structuredClone → Node runtime.
export const runtime = "nodejs";

// GET /api/progress — the learner's current server state + revision.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in to sync your progress." }, { status: 401 });

  const result = await readProgress(supabase, user.id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ state: result.state, revision: result.revision });
}

// POST /api/progress — replay field-level changes onto the row under optimistic
// concurrency on `revision` (bounded retry), so two devices writing at once can't
// clobber each other.
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

  const result = await applyChanges(supabase, user.id, changes);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ state: result.state, revision: result.revision, applied: result.applied });
}
