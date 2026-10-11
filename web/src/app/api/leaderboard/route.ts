import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeXp } from "@/lib/progress/gamification";
import { sanitizeDisplayName, rankLeaderboard, type LeaderboardRow } from "@/lib/leaderboard/core";

export const runtime = "nodejs";

const TOP_LIMIT = 50;

// The opt-in XP leaderboard.
//
//   GET    — the top board + the caller's own opt-in state and standing.
//   POST   — opt in / refresh: recomputes the caller's XP from their OWN progress
//            row (authoritative; the client can't send a score) and publishes it
//            under a sanitized, learner-chosen display name.
//   DELETE — opt out: hides the caller from the board (row kept for easy re-join).
//
// Privacy: nobody is on the board until they POST. Writes use the service role so
// `xp`/`opted_in` can't be forged from the client (RLS grants read only). Signed
// out → 401; this lives behind the authed /learn surface.

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  // Read the board with the service role so the table's RLS can stay self-read-only
  // (migration 0008): that keeps other learners' auth user_ids un-enumerable from the
  // browser anon key. The user_id never leaves the server — rankLeaderboard uses it
  // only to flag the caller's own row and the response omits it.
  const admin = createAdminClient();
  const { data: top } = await admin
    .from("leaderboard_entries")
    .select("user_id, display_name, xp")
    .eq("opted_in", true)
    .order("xp", { ascending: false })
    .limit(TOP_LIMIT);

  const entries = rankLeaderboard((top as LeaderboardRow[] | null) ?? [], user.id);

  // The caller's own row (RLS self-read is fine for their own row).
  const { data: mine } = await supabase
    .from("leaderboard_entries")
    .select("display_name, xp, opted_in")
    .eq("user_id", user.id)
    .maybeSingle();

  let me: { optedIn: boolean; xp: number; rank: number | null; displayName: string | null };
  if (mine?.opted_in) {
    // Exact rank even when outside the top slice: how many opted-in beat me, + 1.
    const { count } = await admin
      .from("leaderboard_entries")
      .select("user_id", { count: "exact", head: true })
      .eq("opted_in", true)
      .gt("xp", mine.xp as number);
    me = {
      optedIn: true,
      xp: (mine.xp as number) ?? 0,
      rank: (count ?? 0) + 1,
      displayName: (mine.display_name as string) ?? null,
    };
  } else {
    me = {
      optedIn: false,
      xp: (mine?.xp as number) ?? 0,
      rank: null,
      displayName: (mine?.display_name as string) ?? null,
    };
  }

  return NextResponse.json({ entries, me }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  let displayName = "";
  try {
    displayName = ((await request.json()) as { displayName?: string }).displayName ?? "";
  } catch {
    // fall through — sanitize handles empty
  }
  const name = sanitizeDisplayName(displayName);

  // Recompute XP from the caller's OWN progress row (RLS self-read) — authoritative,
  // so the published score can't be inflated by the client.
  const { data: progress } = await supabase
    .from("progress")
    .select("state")
    .eq("user_id", user.id)
    .maybeSingle();
  const xp = computeXp((progress?.state as Record<string, unknown> | null) ?? {});

  const { error } = await createAdminClient()
    .from("leaderboard_entries")
    .upsert(
      { user_id: user.id, display_name: name, xp, opted_in: true },
      { onConflict: "user_id" },
    );
  if (error) {
    return NextResponse.json({ error: "Could not update the leaderboard." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, xp, displayName: name }, { headers: { "Cache-Control": "no-store" } });
}

export async function DELETE() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  // Hide from the board but keep the row, so re-joining later is one tap.
  const { error } = await createAdminClient()
    .from("leaderboard_entries")
    .update({ opted_in: false })
    .eq("user_id", user.id);
  if (error) {
    return NextResponse.json({ error: "Could not update the leaderboard." }, { status: 500 });
  }
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
