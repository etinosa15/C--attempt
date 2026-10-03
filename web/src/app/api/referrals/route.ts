import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOrCreateReferralCode } from "@/lib/referrals/server";
import { referralLink, referralStats, type ReferralRow } from "@/lib/referrals/core";

export const runtime = "nodejs";

// GET /api/referrals — the signed-in learner's share code, link, and stats. Mints
// the code on first call (that write needs the service role; learners can only
// read their own row). The link is left origin-relative except for a best-effort
// absolute form the client can copy — we build it from the request origin so it's
// correct in every environment without an env var.
//
// 401 when signed out. Everything a learner can see here is their OWN code and the
// rows where they are the referrer, so this leaks nothing across accounts.
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const code = await getOrCreateReferralCode(createAdminClient(), user.id);
  if (!code) {
    return NextResponse.json(
      { error: "Could not prepare your referral code." },
      { status: 500 },
    );
  }

  // The learner reads their own referrals through RLS (referrer side).
  const { data } = await supabase
    .from("referrals")
    .select("referred_id, status")
    .eq("referrer_id", user.id);
  const stats = referralStats((data as ReferralRow[] | null) ?? []);

  const origin = new URL(request.url).origin;
  return NextResponse.json(
    { code, link: referralLink(code, origin), ...stats },
    { headers: { "Cache-Control": "no-store" } },
  );
}
