import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getPaystackConfig,
  verifyPaystackSignature,
  subscriptionWriteFromEvent,
  type PaystackEvent,
  type SubscriptionWrite,
} from "@/lib/payments/paystack";

export const runtime = "nodejs";

// POST /api/webhooks/paystack — Paystack's source of truth for billing state.
// Paystack calls this on charge/subscription/invoice events; we verify the
// HMAC-SHA512 signature over the RAW body, translate the event into a
// subscriptions-row write, and persist it with the service-role client (the only
// writer RLS permits). This is where a learner actually becomes Pro — never the
// client, never the checkout route.
//
// Attribution: `charge.success` carries our stamped metadata.user_id, so it writes
// by user_id. Lifecycle events (subscription.*, invoice.*) only carry a Paystack
// customer code, so we resolve it to a user via the provider_customer_id that an
// earlier charge.success stored. If no row carries that customer yet, we ack and
// move on — state converges on the next event once the mapping exists.
//
// Status codes follow Paystack's retry behavior: 2xx stops retries, non-2xx asks
// it to retry. Bad signature -> 401; nothing to do -> 200; transient DB error ->
// 500 (retry).
export async function POST(request: Request) {
  const config = getPaystackConfig();
  if (!config) {
    return NextResponse.json({ error: "Not configured." }, { status: 503 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get("x-paystack-signature");
  if (!verifyPaystackSignature(rawBody, signature, config.secretKey)) {
    return NextResponse.json({ error: "Bad signature." }, { status: 401 });
  }

  let event: PaystackEvent;
  try {
    event = JSON.parse(rawBody) as PaystackEvent;
  } catch {
    return NextResponse.json({ error: "Bad payload." }, { status: 400 });
  }

  const write = subscriptionWriteFromEvent(event);
  if (!write) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const admin = createAdminClient();

  // Resolve the write to a concrete user_id.
  let userId: string | null = null;
  let customerToStore: string | null = null;
  if (write.by === "user") {
    userId = write.userId;
    customerToStore = write.provider_customer_id;
  } else {
    // Look up the learner by the customer code an earlier charge.success stored.
    const { data } = await admin
      .from("subscriptions")
      .select("user_id")
      .eq("provider_customer_id", write.customerCode)
      .maybeSingle();
    userId = (data?.user_id as string | undefined) ?? null;
    if (!userId) {
      // Can't attribute yet — ack; a later event (or the originating charge) will.
      return NextResponse.json({ ok: true, ignored: true, reason: "unknown customer" });
    }
  }

  const columns = rowColumns(write, customerToStore);
  const { error } = await admin
    .from("subscriptions")
    .update(columns)
    .eq("user_id", userId);
  if (error) {
    return NextResponse.json({ error: "Write failed." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

/** The columns to set on the subscriptions row, shared by both write variants.
 *  provider_customer_id is only written when we actually know it (charge.success),
 *  so a lifecycle update never nulls out the stored customer. */
function rowColumns(write: SubscriptionWrite, customer: string | null) {
  const base = {
    plan: write.plan,
    status: write.status,
    current_period_end: write.current_period_end,
    cancel_at_period_end: write.cancel_at_period_end,
    provider: write.provider,
    provider_subscription_id: write.provider_subscription_id,
  };
  return customer ? { ...base, provider_customer_id: customer } : base;
}
