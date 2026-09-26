import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { readProgress } from "@/lib/progress/handlers";
import { freshState } from "@/lib/progress/core";
import { preflight, withCors, hasSyncHeader } from "@/lib/api/cors";

// POST /api/auth/login — legacy-protocol sign-in adapter. Validates the credentials
// against Supabase, sets the session cookie (for same-origin use) AND returns the
// access token so the cross-origin studio can carry it as a bearer. Also returns the
// account's current progress so the client can reconcile in one round-trip.
export const runtime = "nodejs";

export function OPTIONS(request: Request) {
  return preflight(request);
}

export async function POST(request: Request) {
  if (!hasSyncHeader(request))
    return withCors(request, NextResponse.json({ error: "Missing sync header." }, { status: 403 }));

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return withCors(request, NextResponse.json({ error: "Invalid request." }, { status: 400 }));
  }
  const { email, password } = (payload as { email?: unknown; password?: unknown }) || {};
  if (typeof email !== "string" || typeof password !== "string")
    return withCors(request, NextResponse.json({ error: "Email and password are required." }, { status: 400 }));

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user || !data.session)
    return withCors(request, NextResponse.json({ error: "Incorrect email or password." }, { status: 401 }));

  const progress = await readProgress(supabase, data.user.id);
  return withCors(
    request,
    NextResponse.json({
      token: data.session.access_token,
      email: data.user.email,
      state: progress.ok ? progress.state : freshState(),
      revision: progress.ok ? progress.revision : 0,
    }),
  );
}
