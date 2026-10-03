import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getStudentStatus } from "@/lib/payments/student-server";

export const runtime = "nodejs";

// GET /api/student — the signed-in learner's student-verification status, plus
// where to go to verify (the configured provider's hosted flow) and whether a
// student discount is live at all. UX only: the discount is re-checked and applied
// server-side at checkout, never granted here.
//
// 401 when signed out. A learner only ever sees their OWN status (RLS self-read).
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const status = await getStudentStatus(supabase, user.id);

  // Verification is only offerable when a provider flow is configured AND a
  // discount exists to grant — otherwise the panel degrades to "not live yet".
  const verifyUrl = process.env.STUDENT_VERIFY_URL ?? null;
  const available = Boolean(verifyUrl && process.env.STUDENT_DISCOUNT_ID);

  return NextResponse.json(
    {
      verified: status.verified,
      expiresAt: status.expiresAt,
      available,
      verifyUrl: available ? verifyUrl : null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
