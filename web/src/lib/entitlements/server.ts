// Server-side entitlement access. Reads the trusted subscriptions row (RLS
// self-read via the cookie-bound server client) and resolves it. This is the
// seam the app should call from route handlers and server components; the pure
// resolver in ./policy stays free of any Supabase dependency so it can be tested
// in isolation and reused on the client with a hydrated row.

import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveEntitlement } from "./policy";
import { resolveTeamEntitlement, maxEntitlement, type TeamRow, type TeamMembership } from "./team-policy";
import type { Entitlement, SubscriptionRow } from "./types";

const COLUMNS =
  "user_id, plan, status, trial_ends_at, current_period_end, cancel_at_period_end, provider, provider_customer_id, provider_subscription_id, created_at, updated_at";

/**
 * Fetch and resolve the entitlement for `userId`. A missing row resolves to the
 * Free floor (see resolveEntitlement) — so a read error or an un-seeded legacy
 * account degrades safe rather than throwing on a hot path.
 *
 * Teams (Phase 6): a learner who isn't already Pro from their own subscription may
 * still inherit Pro through an active team seat. We only run that extra lookup when
 * the own entitlement is NOT Pro (so trial/paid learners skip it), and any failure
 * degrades to the own entitlement — so the team path can never downgrade anyone.
 */
export async function getEntitlement(
  supabase: SupabaseClient,
  userId: string,
  now: Date = new Date(),
): Promise<Entitlement> {
  const { data } = await supabase
    .from("subscriptions")
    .select(COLUMNS)
    .eq("user_id", userId)
    .maybeSingle();
  const own = resolveEntitlement((data as SubscriptionRow | null) ?? null, now);
  if (own.tier === "pro") return own; // already max — skip the team query

  try {
    const team = await getTeamEntitlement(supabase, userId, now);
    if (team) return maxEntitlement(own, team);
  } catch {
    // Teams tables absent (migration not applied) or a read error — keep `own`.
  }
  return own;
}

/**
 * The entitlement a learner inherits from an active team seat, or null when they
 * aren't on a live team. Reads only their own membership (RLS self-read) plus the
 * team row (RLS allows members). Used by getEntitlement as a non-downgrading
 * fallback; inert until a team exists for the learner.
 */
export async function getTeamEntitlement(
  supabase: SupabaseClient,
  userId: string,
  now: Date = new Date(),
): Promise<Entitlement | null> {
  const { data: memberships } = await supabase
    .from("team_members")
    .select("team_id, status, role")
    .eq("user_id", userId)
    .eq("status", "active")
    .limit(1);
  const membership = memberships?.[0];
  if (!membership) return null;

  const { data: team } = await supabase
    .from("teams")
    .select("status, current_period_end")
    .eq("id", membership.team_id)
    .maybeSingle();
  if (!team) return null;

  return resolveTeamEntitlement(
    team as TeamRow,
    { status: membership.status as string, role: membership.role as string } as TeamMembership,
    now,
  );
}

/**
 * Fetch the raw subscriptions row for `userId`, or null when there is none. The
 * entitlement resolver is what most of the app reads; this is for the few places
 * that must show the learner the *stored* facts (the account dashboard's renewal
 * date, a scheduled cancellation) rather than the computed access level. RLS
 * self-read applies, so this can only ever return the caller's own row.
 */
export async function getSubscriptionRow(
  supabase: SupabaseClient,
  userId: string,
): Promise<SubscriptionRow | null> {
  const { data } = await supabase
    .from("subscriptions")
    .select(COLUMNS)
    .eq("user_id", userId)
    .maybeSingle();
  return (data as SubscriptionRow | null) ?? null;
}
