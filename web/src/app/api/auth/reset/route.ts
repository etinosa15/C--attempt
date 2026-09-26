import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { preflight, withCors, hasSyncHeader } from "@/lib/api/cors";

// POST /api/auth/reset — legacy-protocol password-reset-request adapter. The
// cross-origin studio has nowhere to complete a recovery on its own origin (a
// Supabase recovery session must be established where Supabase is configured), so
// the reset email's link points back at THIS app's /auth/confirm route and on to
// /update-password — the very flow the Next-native /reset page already uses. The
// studio only kicks off the email here; the learner sets the new password on this
// app, then returns to the studio and signs in with it.
//
// Always replies { ok: true }, even for an unknown address or a send hiccup: a
// differing response would let anyone probe which emails have accounts. (Signup
// can't hide this — it signs you in on success — but a reset request has no such
// tell, so the enumeration channel is closed here.)
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
  const { email } = (payload as { email?: unknown }) || {};
  if (typeof email !== "string" || !email)
    return withCors(request, NextResponse.json({ error: "An email is required." }, { status: 400 }));

  const { origin } = new URL(request.url);
  const supabase = await createClient();
  // Ignore the outcome on purpose: a missing account or a delivery error must look
  // identical to success so the response never reveals whether the address exists.
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/confirm?next=/update-password`,
  });
  return withCors(request, NextResponse.json({ ok: true }));
}
