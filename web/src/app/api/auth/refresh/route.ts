import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { preflight, withCors, hasSyncHeader } from "@/lib/api/cors";

// POST /api/auth/refresh — legacy-protocol token-renewal adapter. The cross-origin
// studio holds its Supabase access token in memory (never localStorage); that token
// expires in ~1h. Rather than dropping the learner to local mode mid-session, the
// studio trades its refresh token here for a fresh access token before expiry. Refresh
// tokens rotate on use, so we always hand back the new one for the studio to store.
// No bearer needed: the refresh token itself is the credential. A spent or invalid
// token yields 401, and the studio then signs out cleanly.
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
  const { refreshToken } = (payload as { refreshToken?: unknown }) || {};
  if (typeof refreshToken !== "string" || !refreshToken)
    return withCors(request, NextResponse.json({ error: "A refresh token is required." }, { status: 400 }));

  const supabase = await createClient();
  const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });
  if (error || !data.session)
    return withCors(request, NextResponse.json({ error: "Your session has expired. Sign in again." }, { status: 401 }));

  return withCors(
    request,
    NextResponse.json({
      token: data.session.access_token,
      refreshToken: data.session.refresh_token,
      expiresIn: data.session.expires_in,
    }),
  );
}
