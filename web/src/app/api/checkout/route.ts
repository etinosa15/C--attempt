import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveSelection } from "@/lib/payments/catalog";
import { getPaddleConfig, priceIdFor, createCheckoutTransaction } from "@/lib/payments/paddle";
import { getPaystackConfig, initializeTransaction } from "@/lib/payments/paystack";
import { targetFor } from "@/lib/payments/paystack-catalog";
import { resolveFoundingDeal } from "@/lib/payments/founding-deal";
import { getStudentStatus } from "@/lib/payments/student-server";
import { pickCheckoutDiscount } from "@/lib/payments/student";

export const runtime = "nodejs";

// POST /api/checkout — start a checkout for the chosen plan.
//
// Provider-aware: Paystack (our Nigeria-first gateway) is preferred when
// configured; Paddle (the merchant-of-record path) is the fallback for selling
// internationally. Either way the flow is server-authoritative — we attach the
// signed-in learner's id to the transaction so the verified webhook can grant Pro;
// nothing here grants access.
//
// Responses:
//   200 { configured:false }                              — no provider set up yet.
//   401 { error }                                         — signed out.
//   400 { error }                                         — bad/unsellable plan.
//   200 { provider:"paystack", redirectUrl }              — redirect to Paystack.
//   200 { provider:"paddle", transactionId, clientToken, environment } — open overlay.
export async function POST(request: Request) {
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
    // fall through to validation with undefined fields
  }

  const resolved = resolveSelection(plan, billing);
  if (!resolved) {
    return NextResponse.json({ error: "Unknown plan." }, { status: 400 });
  }

  // --- Paystack (preferred) ------------------------------------------------
  const paystack = getPaystackConfig();
  if (paystack) {
    if (!user.email) {
      // Paystack keys the customer by email; every Supabase account has one, but
      // guard rather than send an empty email.
      return NextResponse.json({ error: "Your account needs an email to check out." }, { status: 400 });
    }
    const origin = new URL(request.url).origin;
    // Paystack appends ?reference=…&trxref=… to the callback; the checkout page
    // detects that and shows the confirmation. Carry the plan params for its heading.
    const params = new URLSearchParams({ plan: resolved.selection.plan });
    if (resolved.selection.plan === "pro" && resolved.selection.billing) {
      params.set("billing", resolved.selection.billing);
    }
    const callbackUrl = `${origin}/checkout?${params.toString()}`;

    const result = await initializeTransaction(
      paystack,
      targetFor(resolved.selection),
      user.id,
      user.email,
      callbackUrl,
    );
    if ("error" in result) {
      // A missing plan code / amount in env is a config gap, not a hard failure.
      if (result.error.includes("not configured")) {
        return NextResponse.json({ configured: false });
      }
      return NextResponse.json({ error: result.error }, { status: 502 });
    }
    return NextResponse.json(
      { provider: "paystack", redirectUrl: result.authorizationUrl },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  // --- Paddle (fallback, merchant of record) -------------------------------
  const config = getPaddleConfig();
  const clientToken = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN;
  if (!config || !clientToken) {
    return NextResponse.json({ configured: false });
  }

  const priceId = priceIdFor(resolved.selection);
  if (!priceId) {
    return NextResponse.json({ configured: false });
  }

  // Resolve the ONE discount to apply — never stacked. A verified student's
  // discount (re-checked server-side) always wins over the time-boxed launch deal.
  const studentDiscountId =
    process.env.STUDENT_DISCOUNT_ID && (await getStudentStatus(supabase, user.id)).verified
      ? process.env.STUDENT_DISCOUNT_ID
      : null;
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

  const result = await createCheckoutTransaction(config, priceId, user.id, user.email ?? null, discountId);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  return NextResponse.json(
    { provider: "paddle", transactionId: result.transactionId, clientToken, environment: config.environment },
    { headers: { "Cache-Control": "no-store" } },
  );
}
