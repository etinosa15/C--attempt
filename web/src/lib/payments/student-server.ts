// Student-verification server access. Reading status uses the learner's own
// RLS-scoped client (self-read); granting a verified status needs the service role
// (learners can't write their own row), so the grant lives here next to the other
// privileged writes. The grant is the seam the provider bridge calls once an
// external verifier (SheerID, GitHub Student Pack, …) confirms the student — see
// /api/webhooks/student.

import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveStudentStatus, type StudentRow, type StudentStatus } from "./student";

const COLUMNS = "status, provider, verified_at, expires_at";

/** Read the learner's resolved student status (RLS self-read; their own row only). */
export async function getStudentStatus(
  supabase: SupabaseClient,
  userId: string,
  now: Date = new Date(),
): Promise<StudentStatus> {
  const { data } = await supabase
    .from("student_verifications")
    .select(COLUMNS)
    .eq("user_id", userId)
    .maybeSingle();
  return resolveStudentStatus((data as StudentRow | null) ?? null, now);
}

/**
 * Grant (or renew) a verified student status for `userId`, valid for `months`.
 * Service-role write — the caller must be trusted (the provider webhook, or an
 * admin). Idempotent on user_id: re-verifying just extends the expiry.
 */
export async function grantStudentVerification(
  admin: SupabaseClient,
  userId: string,
  provider: string,
  months = 12,
  now: Date = new Date(),
): Promise<boolean> {
  const expires = new Date(now.getTime() + months * 30 * 24 * 60 * 60 * 1000);
  const { error } = await admin.from("student_verifications").upsert(
    {
      user_id: userId,
      status: "verified",
      provider,
      verified_at: now.toISOString(),
      expires_at: expires.toISOString(),
    },
    { onConflict: "user_id" },
  );
  return !error;
}
