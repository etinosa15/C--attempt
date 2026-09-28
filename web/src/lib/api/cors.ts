// CORS + hardening shared by the legacy-protocol adapter routes (/api/me,
// /api/auth/*, /api/sync). These exist so the unchanged vanilla studio in repo-root
// public/ (which speaks the old sync-server.mjs protocol) can talk to this
// Next+Supabase backend from its own origin. The Next-native React app uses
// /api/progress directly and never needs any of this.
//
// Cross-site cookies are unreliable, so the studio's sync-client falls back to a
// bearer token (see public/sync-client.js). We still allow credentials for the
// same-origin / cookie-capable case, which means the allow-origin header must echo a
// specific origin — never "*". The allowlist is server-only config.
import { NextResponse } from "next/server";

const ALLOWED_ORIGINS = (process.env.FORGE_STUDIO_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function allow(origin: string | null): boolean {
  return !!origin && ALLOWED_ORIGINS.includes(origin);
}

// Headers to attach to every adapter response. Echoes the request Origin only when
// it is on the allowlist; a same-origin request needs no ACAO at all.
export function corsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = { Vary: "Origin" };
  if (allow(origin)) {
    headers["Access-Control-Allow-Origin"] = origin as string;
    headers["Access-Control-Allow-Credentials"] = "true";
  }
  return headers;
}

// Preflight handler. Export as OPTIONS from each adapter route.
export function preflight(request: Request): Response {
  const origin = request.headers.get("origin");
  return new Response(null, {
    status: 204,
    headers: {
      ...corsHeaders(origin),
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Forge-Sync",
      "Access-Control-Max-Age": "600",
    },
  });
}

// Copy the CORS headers onto an already-built NextResponse and return it.
export function withCors(request: Request, res: NextResponse): NextResponse {
  const origin = request.headers.get("origin");
  for (const [key, value] of Object.entries(corsHeaders(origin))) res.headers.set(key, value);
  return res;
}

// The studio sends X-Forge-Sync:1 on every request. It is a custom header, so a
// cross-site form or <img> cannot set it — the same CSRF guard the old sync service
// relied on. Reject anything missing it (the browser preflights first, so a real
// cross-origin studio request always carries it).
export function hasSyncHeader(request: Request): boolean {
  return request.headers.get("x-forge-sync") === "1";
}

// --- Step 10b cutover switch ------------------------------------------------
// Retiring the legacy sync bridge is the destructive half of the cutover: it
// breaks the *live* vanilla studio's sync, so it must not happen until the React
// surface is the confirmed live surface. Rather than hard-code 410s (which would
// go live on the next deploy and can't be walked back without another deploy),
// the retirement is gated behind an env flag that is UNSET in production today.
// The routes behave exactly as before while it is unset; setting FORGE_LEGACY_GONE
// in the prod-gated session flips every adapter to 410 at once, and clearing it
// restores them — no code change, instantly reversible. See docs/phase-1-parity.md.
//
// 410 (not 404/401/429) is deliberate: public/sync-client.js treats 410 as
// "endpoint retired" and degrades to local-only mode, whereas 401/429 are
// special-cased there and would retry or loop.
export function legacyGone(): boolean {
  return process.env.FORGE_LEGACY_GONE === "1";
}

// The 410 body each retired adapter returns (with CORS headers preserved so the
// cross-origin studio can still read it). Call as the first line of a handler:
//   if (legacyGone()) return goneResponse(request);
export function goneResponse(request: Request): NextResponse {
  return withCors(
    request,
    NextResponse.json(
      { error: "This endpoint has been retired. Please update to the current app." },
      { status: 410 },
    ),
  );
}
