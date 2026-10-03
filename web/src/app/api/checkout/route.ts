import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveSelection } from "@/lib/payments/catalog";
import { getPaddleConfig, priceIdFor, createCheckoutTransaction } from "@/lib/payments/paddle";
import { resolveFoundingDeal } from "@/lib/payments/founding-deal";
import { getStudentStatus } from "@/lib/payments/student-server";
import { pickCheckoutDiscount } from "@/lib/payments/student";

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
  let deal: boolean | undefined;
  try {
    const parsed = (await request.json()) as { plan?: string; billing?: string; deal?: unknown };
    plan = parsed.plan;
    billing = parsed.billing;
    deal = Boolean(parsed.deal);
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

  // Resolve the ONE discount to apply — never stacked (plan guardrail: student +
  // launch = negative margin). A verified student's discount (re-checked
  // server-side from their own row) always wins over the time-boxed launch deal.
  const studentDiscountId =
    process.env.STUDENT_DISCOUNT_ID && (await getStudentStatus(supabase, user.id)).verified
      ? process.env.STUDENT_DISCOUNT_ID
      : null;

  // The launch deal, re-resolved server-side against env + now (never trust the
  // flag alone). A passed/absent deadline yields nothing, so a stale ?deal=1 link
  // after the deadline simply checks out at full price.
  const foundingDiscountId =
    deal && !studentDiscountId
      ? (resolveFoundingDeal(
          {
            discountId: process.env.PADDLE_LAUNCH_DISCOUNT_ID,
            deadline: process.env.FOUNDING_DEADLINE,
          },
          new Date(),
        )?.discountId ?? null)
      : null;

  const discountId = pickCheckoutDiscount({ studentDiscountId, foundingDiscountId });

  const result = await createCheckoutTransaction(
    config,
    priceId,
    user.id,
    user.email ?? null,
    discountId,
  );
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
