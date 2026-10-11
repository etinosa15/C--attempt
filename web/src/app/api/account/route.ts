import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

// DELETE /api/account — right to erasure. Delete the auth identity FIRST with the
// service-role client (this is the only step that makes the account unrecoverable,
// and auth.users cascades to progress/profiles), so a failure leaves the account
// fully intact rather than half-erased. Then best-effort clean the rows in case the
// cascade is missing, and clear the session cookie.
export async function DELETE() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

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
