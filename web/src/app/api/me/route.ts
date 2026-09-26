import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/supabase/route-auth";
import { preflight, withCors, hasSyncHeader } from "@/lib/api/cors";

// GET /api/me — the legacy studio's boot-time "is the cookie/token still a session?"
// probe. Returns { email } on a valid session, 401 otherwise. Part of the legacy
// sync-protocol adapter; the Next-native app reads the user from the server session
// directly.
export const runtime = "nodejs";

export function OPTIONS(request: Request) {
  return preflight(request);
}

export async function GET(request: Request) {
  if (!hasSyncHeader(request))
    return withCors(request, NextResponse.json({ error: "Missing sync header." }, { status: 403 }));
  const { user } = await resolveUser(request);
  if (!user) return withCors(request, NextResponse.json({ error: "Signed out." }, { status: 401 }));
  return withCors(request, NextResponse.json({ email: user.email }));
}
