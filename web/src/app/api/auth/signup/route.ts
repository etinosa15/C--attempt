import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { readProgress } from "@/lib/progress/handlers";
import { freshState } from "@/lib/progress/core";
import { preflight, withCors, hasSyncHeader } from "@/lib/api/cors";

// POST /api/auth/signup — legacy-protocol registration adapter. Creates the Supabase
// account; the DB trigger seeds an empty progress row. When email confirmation is off
// (or already satisfied) signUp returns a live session, so we hand back the access
// token + current state exactly like login, and the client's reconcile step folds the
// device's local snapshot in. With confirmation ON, no session yet: return an empty
// token and a fresh state — the client stays local until the learner confirms + signs
// in. (See A#4: because signup logs in on success, existence is not fully hidden;
// bulk probing is bounded by the platform rate limiter. Accepted residual risk.)
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
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) {
    const dup = /already|registered|exists/i.test(error.message);
    return withCors(
      request,
      NextResponse.json(
        { error: dup ? "An account with this email already exists." : "Could not create the account." },
        { status: dup ? 409 : 400 },
      ),
    );
  }
  if (!data.user)
    return withCors(request, NextResponse.json({ error: "Could not create the account." }, { status: 400 }));

  const session = data.session;
  const progress = session ? await readProgress(supabase, data.user.id) : null;
  return withCors(
    request,
    NextResponse.json({
      token: session?.access_token ?? "",
      email: data.user.email,
      state: progress?.ok ? progress.state : freshState(),
      revision: progress?.ok ? progress.revision : 0,
    }),
  );
}
