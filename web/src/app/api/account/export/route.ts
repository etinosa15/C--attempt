import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// GET /api/account/export — everything we hold about the learner, as a JSON
// download (GDPR data portability). Device-local prefs live only in the browser and
// are intentionally not part of the server record.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const [{ data: profile }, { data: progress }] = await Promise.all([
    supabase.from("profiles").select("id, email, display_name, created_at").eq("id", user.id).maybeSingle(),
    supabase.from("progress").select("state, revision, updated_at").eq("user_id", user.id).maybeSingle(),
  ]);

  const bundle = {
    exported_at: new Date().toISOString(),
    account: { id: user.id, email: user.email, ...profile },
    progress: progress ?? null,
  };

  return new NextResponse(JSON.stringify(bundle, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="forge-export-${user.id}.json"`,
    },
  });
}
