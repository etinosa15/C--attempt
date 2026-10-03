import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { grantStudentVerification } from "@/lib/payments/student-server";

export const runtime = "nodejs";

// POST /api/webhooks/student — the server-to-server seam a student-verification
// bridge calls once an external provider (SheerID, GitHub Student Pack, …) has
// confirmed a learner is a student. This is OUR internal contract, not a specific
// provider's wire format: a thin provider function verifies with the provider,
// then POSTs here `{ user_id, provider?, months? }` with a shared bearer secret.
//
// Security mirrors the Paddle webhook: a strong configured secret, compared in
// constant time (a non-constant-time compare is a timing-oracle class). Without
// STUDENT_WEBHOOK_SECRET set the endpoint is inert (503) — it can never grant a
// discount in an unconfigured environment. Granting uses the service role; a
// learner can never reach this (no session grants it).
function authorized(request: Request, secret: string): boolean {
  const header = request.headers.get("authorization") ?? "";
  const prefix = "Bearer ";
  if (!header.startsWith(prefix)) return false;
  const presented = Buffer.from(header.slice(prefix.length));
  const expected = Buffer.from(secret);
  // Length-independent constant-time compare (hash both to a fixed width first, so
  // comparing different lengths doesn't itself leak via an early return).
  const a = crypto.createHash("sha256").update(presented).digest();
  const b = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  const secret = process.env.STUDENT_WEBHOOK_SECRET;
  if (!secret) {
    // Not configured — never grant anything in this environment.
    return NextResponse.json({ configured: false }, { status: 503 });
  }
  if (!authorized(request, secret)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let userId: string | undefined;
  let provider = "external";
  let months = 12;
  try {
    const body = (await request.json()) as { user_id?: string; provider?: string; months?: number };
    userId = body.user_id;
    if (typeof body.provider === "string") provider = body.provider;
    if (Number.isFinite(body.months) && (body.months as number) > 0) months = body.months as number;
  } catch {
    // fall through to validation
  }
  if (!userId) {
    return NextResponse.json({ error: "Missing user_id." }, { status: 400 });
  }

  const ok = await grantStudentVerification(createAdminClient(), userId, provider, months);
  if (!ok) {
    return NextResponse.json({ error: "Could not record verification." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
