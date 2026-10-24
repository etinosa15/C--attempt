import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

// DELETE /api/account — right to erasure. Delete the auth identity FIRST with the
// service-role client (this is the only step that makes the account unrecoverable,
// and auth.users cascades to progress/profiles), so a failure leaves the account
// fully intact rather than half-erased. Then best-effort clean the rows in case the
// cascade is missing, and clear the session cookie.
// Re-auth guard: the caller must type their email, and must have signed in within
// REAUTH_WINDOW_MS, so a stolen or long-idle session cannot erase the account.
const REAUTH_WINDOW_MS = 15 * 60 * 1000;

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { confirmEmail?: unknown } | null;
  const typed = typeof body?.confirmEmail === "string" ? body.confirmEmail.trim().toLowerCase() : "";
  if (!user.email || typed !== user.email.toLowerCase())
    return NextResponse.json({ error: "confirm" }, { status: 400 });
  const lastSignIn = user.last_sign_in_at ? Date.parse(user.last_sign_in_at) : 0;
  if (!(Date.now() - lastSignIn < REAUTH_WINDOW_MS))
    return NextResponse.json({ error: "reauth" }, { status: 403 });

  // Delete the auth identity itself first (requires the service role). Nothing is
  // wiped until this succeeds, so an error here leaves a fully working account.
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) return NextResponse.json({ error: "Could not delete the account identity." }, { status: 500 });

  // Belt-and-suspenders: ensure the dependent rows are gone even if the FK cascade
  // isn't present. Via the admin client, since the caller's session is now invalid.
  await admin.from("progress").delete().eq("user_id", user.id);
  await admin.from("profiles").delete().eq("id", user.id);

  await supabase.auth.signOut();
  return NextResponse.json({ deleted: true });
}
