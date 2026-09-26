import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/supabase/route-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { preflight, withCors, hasSyncHeader } from "@/lib/api/cors";

// POST /api/auth/delete — legacy-protocol account-erasure adapter (GDPR right to
// erasure) for the cross-origin studio. The Next-native DELETE /api/account does the
// same thing behind a session cookie; this variant authenticates by bearer token
// (resolveUser) and carries the X-Forge-Sync + CORS guards, so the studio can reach
// it from its own origin.
//
// Removes the learner's progress + profile rows (RLS-scoped), then deletes the auth
// identity itself with the service-role client — the email + password stop working
// everywhere and cannot be recovered. The studio then drops its in-memory session and
// its sync baseline; this device's LOCAL progress is left untouched (a signed-out,
// local-first learner again), which holds no credential and so is no way back in.
export const runtime = "nodejs";

export function OPTIONS(request: Request) {
  return preflight(request);
}

export async function POST(request: Request) {
  if (!hasSyncHeader(request))
    return withCors(request, NextResponse.json({ error: "Missing sync header." }, { status: 403 }));

  const { supabase, user } = await resolveUser(request);
  if (!user)
    return withCors(request, NextResponse.json({ error: "Sign in first." }, { status: 401 }));

  // RLS-scoped deletes of the learner's own rows. They also cascade from auth.users,
  // but delete them explicitly so erasure still completes if that cascade is missing.
  await supabase.from("progress").delete().eq("user_id", user.id);
  await supabase.from("profiles").delete().eq("id", user.id);

  // Delete the auth identity itself (requires the service role). Only this makes the
  // account truly unrecoverable, so a failure here is a real failure — report it.
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error)
    return withCors(request, NextResponse.json({ error: "Could not delete the account identity." }, { status: 500 }));

  // Best-effort cookie clear for the same-origin case; the studio's bearer session is
  // ended client-side and its JWT expires on its own.
  await supabase.auth.signOut();
  return withCors(request, NextResponse.json({ deleted: true }));
}
