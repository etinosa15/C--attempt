import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { preflight, withCors, hasSyncHeader } from "@/lib/api/cors";

// POST /api/auth/logout — legacy-protocol sign-out adapter. Clears the session cookie
// on this origin. The studio also drops its in-memory bearer token client-side, so a
// bearer-only session is effectively ended there; the JWT itself expires on its own.
export const runtime = "nodejs";

export function OPTIONS(request: Request) {
  return preflight(request);
}

export async function POST(request: Request) {
  if (!hasSyncHeader(request))
    return withCors(request, NextResponse.json({ error: "Missing sync header." }, { status: 403 }));
  const supabase = await createClient();
  await supabase.auth.signOut();
  return withCors(request, NextResponse.json({ ok: true }));
}
