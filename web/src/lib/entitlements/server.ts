// Server-side entitlement access. Reads the trusted subscriptions row (RLS
// self-read via the cookie-bound server client) and resolves it. This is the
// seam the app should call from route handlers and server components; the pure
// resolver in ./policy stays free of any Supabase dependency so it can be tested
// in isolation and reused on the client with a hydrated row.

import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveEntitlement } from "./policy";
import type { Entitlement, SubscriptionRow } from "./types";

const COLUMNS =
  "user_id, plan, status, trial_ends_at, current_period_end, cancel_at_period_end, provider, provider_customer_id, provider_subscription_id, created_at, updated_at";

/**
 * Fetch and resolve the entitlement for `userId`. A missing row resolves to the
 * Free floor (see resolveEntitlement) — so a read error or an un-seeded legacy
 * account degrades safe rather than throwing on a hot path.
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
  return resolveEntitlement((data as SubscriptionRow | null) ?? null, now);
}
