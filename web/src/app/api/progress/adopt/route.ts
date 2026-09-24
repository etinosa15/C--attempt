import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sanitizeState, adoptState, freshState } from "@/lib/progress/core";
import type { ProgressState } from "@/lib/progress/state";

export const runtime = "nodejs";

// POST /api/progress/adopt — first contact between a device and an account. There
// is no shared baseline, so the delta machinery can't run; instead combine the
// device's local state with the account's using core.js `adoptState` (sets union,
// counters take the larger side, free text keeps the account and fills gaps — never
// doubles study time). Called once, on sign-in, with the localStorage snapshot.
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
  const local: ProgressState = sanitizeState((payload as { local?: unknown })?.local ?? {});

  const { data: current, error: readErr } = await supabase
    .from("progress")
    .select("state, revision")
    .eq("user_id", user.id)
    .maybeSingle();
  if (readErr) return NextResponse.json({ error: "Could not read progress." }, { status: 500 });

  const account: ProgressState = current ? sanitizeState(current.state) : freshState();
  const merged = sanitizeState(adoptState(account, local));

  const { data: saved, error: saveErr } = current
    ? await supabase
        .from("progress")
        .update({ state: merged })
        .eq("user_id", user.id)
        .select("state, revision")
        .maybeSingle()
    : await supabase
        .from("progress")
        .insert({ user_id: user.id, state: merged, revision: 0 })
        .select("state, revision")
        .maybeSingle();
  if (saveErr) return NextResponse.json({ error: "Could not save progress." }, { status: 500 });

  return NextResponse.json({ state: saved?.state ?? merged, revision: saved?.revision ?? 0 });
}
