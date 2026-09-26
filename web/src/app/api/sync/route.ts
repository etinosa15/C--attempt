import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/supabase/route-auth";
import { readProgress, applyChanges } from "@/lib/progress/handlers";
import { sanitizeChanges } from "@/lib/progress/core";
import { preflight, withCors, hasSyncHeader } from "@/lib/api/cors";

// /api/sync — the legacy studio's progress endpoint, mapped onto the same Supabase
// merge logic as /api/progress (shared via handlers.ts). GET returns the current
// state+revision; POST replays { changes } deltas. Auth is cookie OR bearer token
// (resolveUser), so the studio can sync from its own origin.
export const runtime = "nodejs"; // core.js merge uses structuredClone → Node runtime.

export function OPTIONS(request: Request) {
  return preflight(request);
}

export async function GET(request: Request) {
  if (!hasSyncHeader(request))
    return withCors(request, NextResponse.json({ error: "Missing sync header." }, { status: 403 }));
  const { supabase, user } = await resolveUser(request);
  if (!user)
    return withCors(request, NextResponse.json({ error: "Sign in to sync your progress." }, { status: 401 }));

  const result = await readProgress(supabase, user.id);
  if (!result.ok) return withCors(request, NextResponse.json({ error: result.error }, { status: result.status }));
  return withCors(request, NextResponse.json({ state: result.state, revision: result.revision }));
}

export async function POST(request: Request) {
  if (!hasSyncHeader(request))
    return withCors(request, NextResponse.json({ error: "Missing sync header." }, { status: 403 }));
  const { supabase, user } = await resolveUser(request);
  if (!user)
    return withCors(request, NextResponse.json({ error: "Sign in to sync your progress." }, { status: 401 }));

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return withCors(request, NextResponse.json({ error: "Invalid request." }, { status: 400 }));
  }
  const changes = sanitizeChanges((payload as { changes?: unknown })?.changes);

  const result = await applyChanges(supabase, user.id, changes);
  if (!result.ok) return withCors(request, NextResponse.json({ error: result.error }, { status: result.status }));
  return withCors(
    request,
    NextResponse.json({ state: result.state, revision: result.revision, applied: result.applied }),
  );
}
