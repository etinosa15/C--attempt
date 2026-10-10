import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSubscriptionRow } from "@/lib/entitlements/server";
import {
  getPaddleConfig,
  pauseSubscription,
  resumeSubscription,
  cancelSubscription,
  applySubscriptionDiscount,
} from "@/lib/payments/paddle";
import { getPaystackConfig, disableSubscription, enableSubscription } from "@/lib/payments/paystack";

export const runtime = "nodejs";

// POST /api/billing/subscription — perform a subscription-lifecycle action on the
// signed-in learner's OWN subscription: the cancellation save-flow's alternatives
// (pause, resume, apply a retention discount) and the cancel itself.
//
// Provider-aware. Server-authoritative: the subscription id is read from the
// caller's own RLS-scoped row — never from the request. The provider owns the real
// state change; we call its API and let the resulting signed webhook flip our row.
// We never write entitlement state here.
//
// Paystack is a gateway (not an MoR): it supports cancel (disable) and resume
// (enable) but has no "pause" and no init-time retention discount, so those actions
// report { configured:false } under Paystack — and the save-flow doesn't offer them
// there in the first place.
//
// Responses: 200 {ok:true} | 200 {configured:false} | 400 | 401 | 404 | 502.
type Action = "pause" | "resume" | "cancel" | "discount";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  let action: string | undefined;
  try {
    action = ((await request.json()) as { action?: string }).action;
  } catch {
    // fall through to validation
  }
  if (action !== "pause" && action !== "resume" && action !== "cancel" && action !== "discount") {
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }

  const row = await getSubscriptionRow(supabase, user.id);
  const subscriptionId = row?.provider_subscription_id ?? null;
  if (!subscriptionId) {
    return NextResponse.json({ error: "No subscription to change." }, { status: 404 });
  }

  const a = action as Action;
  let ok = false;

  // --- Paystack (preferred) ------------------------------------------------
  const paystack = getPaystackConfig();
  if (paystack) {
    if (a === "cancel") ok = await disableSubscription(paystack, subscriptionId);
    else if (a === "resume") ok = await enableSubscription(paystack, subscriptionId);
    // pause / discount aren't offered on Paystack.
    else return NextResponse.json({ configured: false }, { headers: { "Cache-Control": "no-store" } });
  } else {
    // --- Paddle (fallback) -------------------------------------------------
    const config = getPaddleConfig();
    if (!config) {
      return NextResponse.json({ configured: false }, { headers: { "Cache-Control": "no-store" } });
    }
    if (a === "pause") ok = await pauseSubscription(config, subscriptionId);
    else if (a === "resume") ok = await resumeSubscription(config, subscriptionId);
    else if (a === "cancel") ok = await cancelSubscription(config, subscriptionId);
    else {
      const discountId = process.env.PADDLE_RETENTION_DISCOUNT_ID;
      if (!discountId) return NextResponse.json({ configured: false });
      ok = await applySubscriptionDiscount(config, subscriptionId, discountId);
    }
  }

  if (!ok) {
    return NextResponse.json(
      { error: "We couldn't apply that change. Please try again." },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
