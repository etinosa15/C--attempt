import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSubscriptionRow } from "@/lib/entitlements/server";
import { getPaddleConfig, createCustomerPortalSession } from "@/lib/payments/paddle";

export const runtime = "nodejs";

// POST /api/billing/portal — mint a Paddle customer-portal URL for the signed-in
// learner so they can manage their payment method, download invoices, or cancel.
//
// Paddle is the merchant of record, so the portal is Paddle's, not ours: we never
// handle cards or implement a cancel that could silently break a real subscription.
// We only resolve the trusted customer id from the learner's own subscriptions row
// (RLS self-read; the learner can't point this at someone else's customer) and ask
// Paddle for a one-time portal URL to redirect to.
//
// Responses:
//   200 { url }            — redirect the client harness to Paddle's portal.
//   200 { configured:false } — Paddle isn't set up in this env yet.
//   401 { error }          — signed out.
//   404 { error }          — no provider subscription to manage (Free/trial only).
//   502 { error }          — Paddle reachable but couldn't mint a portal session.
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  const row = await getSubscriptionRow(supabase, user.id);
  const customerId = row?.provider_customer_id ?? null;
  if (!customerId) {
    // Nothing to manage — the learner is on the Free floor / trial with no MoR row.
    return NextResponse.json(
      { error: "No paid subscription to manage yet." },
      { status: 404 },
    );
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
