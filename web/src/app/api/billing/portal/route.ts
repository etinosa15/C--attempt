import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSubscriptionRow } from "@/lib/entitlements/server";
import { getPaddleConfig, createCustomerPortalSession } from "@/lib/payments/paddle";
import { getPaystackConfig, manageSubscriptionLink } from "@/lib/payments/paystack";

export const runtime = "nodejs";

// POST /api/billing/portal — mint a hosted "manage billing" URL for the signed-in
// learner so they can update their payment method (and, on Paddle, download
// invoices / cancel).
//
// Provider-aware. The learner's trusted ids come from their own subscriptions row
// (RLS self-read; they can't point this at someone else's) — never from the
// request. On Paddle (MoR) that's the customer portal; on Paystack it's the hosted
// subscription-management page (keyed by the subscription code). We never handle
// cards ourselves.
//
// Responses: 200 {url} | 200 {configured:false} | 401 | 404 | 502.
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  const row = await getSubscriptionRow(supabase, user.id);

  // --- Paystack (preferred) ------------------------------------------------
  const paystack = getPaystackConfig();
  if (paystack) {
    const subscriptionId = row?.provider_subscription_id ?? null;
    if (!subscriptionId) {
      // Lifetime / trial / Free: no recurring subscription to manage.
      return NextResponse.json({ error: "No subscription to manage yet." }, { status: 404 });
    }
    const url = await manageSubscriptionLink(paystack, subscriptionId);
    if (!url) {
      return NextResponse.json(
        { error: "Could not open the billing portal. Please try again." },
        { status: 502 },
      );
    }
    return NextResponse.json({ url }, { headers: { "Cache-Control": "no-store" } });
  }

  // --- Paddle (fallback) ---------------------------------------------------
  const customerId = row?.provider_customer_id ?? null;
  if (!customerId) {
    return NextResponse.json({ error: "No paid subscription to manage yet." }, { status: 404 });
  }

  const config = getPaddleConfig();
  if (!config) {
    return NextResponse.json({ configured: false }, { headers: { "Cache-Control": "no-store" } });
  }

  const url = await createCustomerPortalSession(config, customerId);
  if (!url) {
    return NextResponse.json(
      { error: "Could not open the billing portal. Please try again." },
      { status: 502 },
    );
  }

  return NextResponse.json({ url }, { headers: { "Cache-Control": "no-store" } });
}
