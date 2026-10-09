import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveSeatUsage } from "@/lib/teams/seats";

export const runtime = "nodejs";

// GET /api/teams — the signed-in learner's team membership + (for owners/admins)
// seat usage. Read-only status for the account surface; creating teams, buying
// seats, and inviting members are later (billing) units.
//
// The caller's own membership is an RLS self-read. The active-member COUNT (for
// seat usage) is a server-authoritative read via the service role — only after
// confirming the caller is themselves an active member of that team — so we expose
// a seat tally without broadly exposing the roster (names/progress stay private
// until the cohort-dashboard unit designs that deliberately). 401 when signed out;
// { team: null } when the learner isn't on a team.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const { data: memberships } = await supabase
    .from("team_members")
    .select("team_id, role, status")
    .eq("user_id", user.id)
    .eq("status", "active")
    .limit(1);
  const membership = memberships?.[0];
  if (!membership) {
    return NextResponse.json({ team: null }, { headers: { "Cache-Control": "no-store" } });
  }

  const { data: team } = await supabase
    .from("teams")
    .select("name, seats, status, current_period_end")
    .eq("id", membership.team_id)
    .maybeSingle();
  if (!team) {
    return NextResponse.json({ team: null }, { headers: { "Cache-Control": "no-store" } });
  }

  // Seat usage: count active members with the service role (the caller is a
  // confirmed active member, so revealing only the tally is appropriate).
  const { count } = await createAdminClient()
    .from("team_members")
    .select("user_id", { count: "exact", head: true })
    .eq("team_id", membership.team_id)
    .eq("status", "active");
  const usage = resolveSeatUsage((team.seats as number) ?? 0, count ?? 0);

  const canManage = membership.role === "owner" || membership.role === "admin";
  return NextResponse.json(
    {
      team: {
        name: team.name,
        role: membership.role,
        status: team.status,
        renewalDate: team.current_period_end,
        // Seat tally is for owners/admins; members just see they're on the team.
        seats: canManage ? usage : null,
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
