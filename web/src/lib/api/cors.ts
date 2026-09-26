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
import type { NextResponse } from "next/server";

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
