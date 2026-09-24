import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

// DELETE /api/account — right to erasure. Remove the progress + profile rows (both
// also cascade from auth.users, but delete them explicitly so it works even if the
// admin key is misconfigured), then delete the auth identity with the service-role
// client, then clear the session cookie.
export async function DELETE() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  // RLS-scoped deletes of the learner's own rows.
  await supabase.from("progress").delete().eq("user_id", user.id);
  await supabase.from("profiles").delete().eq("id", user.id);

  // Delete the auth identity itself (requires the service role).
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) return NextResponse.json({ error: "Could not delete the account identity." }, { status: 500 });

  await supabase.auth.signOut();
  return NextResponse.json({ deleted: true });
}
