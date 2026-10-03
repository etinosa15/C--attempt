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

export const runtime = "nodejs";

// POST /api/billing/subscription — perform a subscription-lifecycle action on the
// signed-in learner's OWN subscription: the cancellation save-flow's alternatives
// (pause, resume, apply a retention discount) and the cancel itself.
//
// Server-authoritative: the subscription id is read from the caller's own
// RLS-scoped row — never taken from the request — so a learner can only ever act
// on their own subscription. Paddle (the merchant of record) owns the real state
// change; we call its API and let the resulting signed webhook flip our
// subscriptions row. We never write entitlement state from here.
//
// Responses:
//   200 { ok: true }         — Paddle accepted the change.
//   200 { configured:false } — Paddle isn't set up in this env yet.
//   400 { error }            — unknown action.
//   401 { error }            — signed out.
//   404 { error }            — no provider subscription to act on.
//   502 { error }            — Paddle reachable but rejected the change.
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
    // fall through to the validation below
  }
  if (action !== "pause" && action !== "resume" && action !== "cancel" && action !== "discount") {
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }

  const row = await getSubscriptionRow(supabase, user.id);
  const subscriptionId = row?.provider_subscription_id ?? null;
  if (!subscriptionId) {
    return NextResponse.json({ error: "No subscription to change." }, { status: 404 });
  }

  const config = getPaddleConfig();
  if (!config) {
    return NextResponse.json({ configured: false }, { headers: { "Cache-Control": "no-store" } });
  }

  const a = action as Action;
  let ok = false;
  if (a === "pause") ok = await pauseSubscription(config, subscriptionId);
  else if (a === "resume") ok = await resumeSubscription(config, subscriptionId);
  else if (a === "cancel") ok = await cancelSubscription(config, subscriptionId);
  else {
    const discountId = process.env.PADDLE_RETENTION_DISCOUNT_ID;
    if (!discountId) return NextResponse.json({ configured: false });
    ok = await applySubscriptionDiscount(config, subscriptionId, discountId);
  }

  if (!ok) {
    return NextResponse.json(
      { error: "Paddle couldn't apply that change. Please try again." },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
