import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getPaddleConfig,
  verifyPaddleSignature,
  subscriptionUpsertFromEvent,
  type PaddleEvent,
} from "@/lib/payments/paddle";

export const runtime = "nodejs";

// POST /api/webhooks/paddle — the merchant-of-record's source of truth for
// billing state. Paddle calls this on subscription and transaction events; we
// verify the signature over the RAW body, translate the event into a
// subscriptions-row update, and write it with the service-role client (the only
// writer RLS permits). This is where a learner actually becomes Pro — never the
// client, never the checkout route.
//
// Status codes are chosen for Paddle's retry behavior: 2xx acks (stop retrying),
// non-2xx asks Paddle to retry. So a bad signature is 401 (won't help to retry,
// but signals rejection), an event we can't use is 200 (ack, nothing to do), and
// a transient DB failure is 500 (please retry).
export async function POST(request: Request) {
  const config = getPaddleConfig();
  if (!config) {
    // Payments not configured in this environment — nothing can be trusted.
    return NextResponse.json({ error: "Not configured." }, { status: 503 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get("paddle-signature");
  if (!verifyPaddleSignature(rawBody, signature, config.webhookSecret)) {
    return NextResponse.json({ error: "Bad signature." }, { status: 401 });
  }

  let event: PaddleEvent;
  try {
    event = JSON.parse(rawBody) as PaddleEvent;
  } catch {
    return NextResponse.json({ error: "Bad payload." }, { status: 400 });
  }

  const upsert = subscriptionUpsertFromEvent(event);
  if (!upsert) {
    // Verified, but not an event we act on (or no user_id to attribute).
    return NextResponse.json({ ok: true, ignored: true });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("subscriptions")
    .upsert(upsert, { onConflict: "user_id" });
  if (error) {
    // Let Paddle retry — don't lose a paid upgrade to a transient write error.
    return NextResponse.json({ error: "Write failed." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
