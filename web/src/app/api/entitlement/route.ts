import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getEntitlement } from "@/lib/entitlements/server";

export const runtime = "nodejs";

// GET /api/entitlement — the current learner's effective entitlement (tier,
// trial state, feature flags), resolved server-side from the trusted
// subscriptions row. The client may use this to refresh its view (e.g. after a
// checkout returns), but access decisions that matter are re-resolved server-side
// on each gated request — this endpoint is for UX, not enforcement.
//
// Signed-out callers get a 401; a signed-out learner is on the local-only Free
// experience with no account entitlement to report.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const entitlement = await getEntitlement(supabase, user.id);
  // Private to the learner and time-sensitive (trial countdown) — never cache.
  return NextResponse.json(entitlement, {
    headers: { "Cache-Control": "no-store" },
  });
}
