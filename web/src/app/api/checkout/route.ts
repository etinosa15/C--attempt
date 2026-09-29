import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveSelection } from "@/lib/payments/catalog";
import { getPaddleConfig, priceIdFor, createCheckoutTransaction } from "@/lib/payments/paddle";

export const runtime = "nodejs";

// POST /api/checkout — start a Paddle checkout for the chosen plan.
//
// Server-authoritative: we resolve the signed-in learner, create the Paddle
// transaction here (stamping custom_data.user_id so the webhook can attribute
// the purchase), and hand the client only the transaction id + the public
// client token to open the overlay. Granting Pro is NOT done here — that waits
// for the verified webhook to write the subscriptions row via the service role.
//
// Responses:
//   200 { configured: false }         — Paddle isn't set up in this env yet.
//   401 { error }                     — signed out; can't attach a purchase.
//   400 { error }                     — bad/unsellable plan selection.
//   200 { transactionId, clientToken, environment } — open the overlay.
export async function POST(request: Request) {
  const config = getPaddleConfig();
  const clientToken = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN;
  if (!config || !clientToken) {
    return NextResponse.json({ configured: false });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in to upgrade." }, { status: 401 });
  }

  let plan: string | undefined;
  let billing: string | undefined;
  try {
    const parsed = (await request.json()) as { plan?: string; billing?: string };
    plan = parsed.plan;
    billing = parsed.billing;
  } catch {
    // fall through to the validation below with undefined fields
  }

  const resolved = resolveSelection(plan, billing);
  if (!resolved) {
    return NextResponse.json({ error: "Unknown plan." }, { status: 400 });
  }

  const priceId = priceIdFor(resolved.selection);
  if (!priceId) {
    // Selection is valid but its price isn't configured in this env.
    return NextResponse.json({ configured: false });
  }

  const result = await createCheckoutTransaction(config, priceId, user.id, user.email ?? null);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  return NextResponse.json(
    {
      transactionId: result.transactionId,
      clientToken,
      environment: config.environment,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
