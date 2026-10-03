// Paddle (Billing) integration core. Split so the security- and logic-critical
// parts are pure and unit-tested: signature verification and the webhook
// event -> subscriptions-row mapping take all their inputs as arguments. The
// env-bound config and the outbound API call are the only impure pieces.
//
// Server-only. NEVER import this into a client component: it reads the API key
// and webhook secret. Merchant-of-record model — Paddle collects tax and is the
// reseller; we only translate its webhooks into our server-authoritative
// subscriptions row (via the service-role client) and open its hosted checkout.
import crypto from "node:crypto";
import type { Plan, SubscriptionStatus } from "../entitlements/types";
import { resolveSelection, type PlanSelection } from "./catalog";

// ---------------------------------------------------------------------------
// Config (env-bound). Absent config => the payments flow is "not configured"
// and the UI degrades to the honest placeholder, exactly like the sync bridge.
// ---------------------------------------------------------------------------
export type PaddleConfig = {
  apiKey: string;
  webhookSecret: string;
  /** "sandbox" | "production" — selects the API base URL. */
  environment: "sandbox" | "production";
  apiBase: string;
};

/** Read Paddle server config from env, or null when it isn't fully set. */
export function getPaddleConfig(): PaddleConfig | null {
  const apiKey = process.env.PADDLE_API_KEY;
  const webhookSecret = process.env.PADDLE_WEBHOOK_SECRET;
  if (!apiKey || !webhookSecret) return null;
  const environment = process.env.PADDLE_ENV === "production" ? "production" : "sandbox";
  const apiBase =
    environment === "production" ? "https://api.paddle.com" : "https://sandbox-api.paddle.com";
  return { apiKey, webhookSecret, environment, apiBase };
}

/** Resolve a selection to its configured Paddle price ID, or null if unset. */
export function priceIdFor(selection: PlanSelection): string | null {
  const resolved = resolveSelection(selection.plan, selection.billing);
  if (!resolved) return null;
  return process.env[resolved.entry.priceEnv] ?? null;
}

// ---------------------------------------------------------------------------
// Webhook signature verification (PURE).
//
// Paddle Billing signs every webhook: header `Paddle-Signature: ts=<unix>;h1=<hex>`
// (multiple h1 values can appear during secret rotation). The signed payload is
// `<ts>:<rawBody>`, HMAC-SHA256 with the webhook secret. We compare in constant
// time (timingSafeEqual) — a non-constant-time compare is a known Paddle-verifier
// vulnerability class (timing oracle) — and reject stale timestamps to blunt
// replay. Pass the RAW request body; re-serializing JSON breaks the hash.
// ---------------------------------------------------------------------------
export function verifyPaddleSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
  now: Date = new Date(),
  toleranceSeconds = 5 * 60,
): boolean {
  if (!signatureHeader || !secret) return false;

  let ts: string | null = null;
  const h1s: string[] = [];
  for (const part of signatureHeader.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key === "ts") ts = val;
    else if (key === "h1" && val) h1s.push(val);
  }
  if (!ts || h1s.length === 0) return false;

  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum)) return false;
  if (Math.abs(now.getTime() / 1000 - tsNum) > toleranceSeconds) return false;

  const expected = crypto.createHmac("sha256", secret).update(`${ts}:${rawBody}`).digest();
  return h1s.some((h1) => {
    let received: Buffer;
    try {
      received = Buffer.from(h1, "hex");
    } catch {
      return false;
    }
    return received.length === expected.length && crypto.timingSafeEqual(received, expected);
  });
}

// ---------------------------------------------------------------------------
// Webhook event -> subscriptions-row mapping (PURE).
//
// Only the shape we read is typed; Paddle sends much more. We map the events
// that change entitlement into a partial `public.subscriptions` update keyed by
// user_id (carried in custom_data.user_id, which we set when creating the
// transaction). Events we don't handle, or can't attribute to a user, map to
// null and are acked without a write.
// ---------------------------------------------------------------------------

/** The minimal slice of a Paddle webhook event we depend on. */
export type PaddleEvent = {
  event_type?: string;
  data?: {
    id?: string;
    status?: string;
    customer_id?: string | null;
    subscription_id?: string | null;
    custom_data?: { user_id?: string } | null;
    current_billing_period?: { ends_at?: string | null } | null;
    scheduled_change?: { action?: string } | null;
  };
};

/** A row write derived from an event: the user_id key plus the columns to set. */
export type SubscriptionUpsert = {
  user_id: string;
  plan: Plan;
  status: SubscriptionStatus;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  provider: "paddle";
  provider_customer_id: string | null;
  provider_subscription_id: string | null;
};

/** Map Paddle's subscription status to our lifecycle vocabulary. */
function mapStatus(paddle: string | undefined): SubscriptionStatus {
  switch (paddle) {
    case "active":
      return "active";
    case "trialing":
      return "trialing";
    case "past_due":
      return "past_due";
    case "canceled":
      return "canceled";
    // paused / anything unexpected -> lose access (resolver drops to Free).
    default:
      return "expired";
  }
}

/**
 * Translate a verified webhook event into a subscriptions upsert, or null when
 * the event doesn't affect entitlement (or lacks a user_id to attribute it to).
 */
export function subscriptionUpsertFromEvent(event: PaddleEvent): SubscriptionUpsert | null {
  const type = event.event_type;
  const data = event.data;
  if (!type || !data) return null;
  const userId = data.custom_data?.user_id;
  if (!userId) return null;

  const base = {
    user_id: userId,
    provider: "paddle" as const,
    provider_customer_id: data.customer_id ?? null,
  };

  // Recurring subscription lifecycle.
  if (type.startsWith("subscription.")) {
    return {
      ...base,
      plan: "pro",
      status: mapStatus(data.status),
      current_period_end: data.current_billing_period?.ends_at ?? null,
      cancel_at_period_end: data.scheduled_change?.action === "cancel",
      provider_subscription_id: data.id ?? null,
    };
  }

  // One-time purchase (Lifetime): a completed transaction with no subscription.
  // Subscription renewals also emit transaction.completed, but those carry a
  // subscription_id and are handled by the subscription.* events above.
  if (type === "transaction.completed" && !data.subscription_id) {
    return {
      ...base,
      plan: "pro",
      status: "active",
      current_period_end: null, // lifetime never lapses
      cancel_at_period_end: false,
      provider_subscription_id: null,
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Outbound API — create a Paddle transaction for the hosted/overlay checkout
// (IMPURE). We create it server-side so we can stamp custom_data.user_id, which
// then rides along on every webhook and lets us attribute it to a learner. The
// client opens Paddle.js with the returned transaction id.
// ---------------------------------------------------------------------------
export async function createCheckoutTransaction(
  config: PaddleConfig,
  priceId: string,
  userId: string,
  email: string | null,
  discountId?: string | null,
): Promise<{ transactionId: string } | { error: string }> {
  const body: Record<string, unknown> = {
    items: [{ price_id: priceId, quantity: 1 }],
    custom_data: { user_id: userId },
  };
  if (email) body.customer = { email };
  // A launch/founding discount, when one is live and the server has re-validated it.
  if (discountId) body.discount_id = discountId;

  const res = await fetch(`${config.apiBase}/transactions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    return { error: `Paddle transaction failed (${res.status})` };
  }
  const json = (await res.json()) as { data?: { id?: string } };
  const id = json.data?.id;
  if (!id) return { error: "Paddle response missing transaction id" };
  return { transactionId: id };
}

// ---------------------------------------------------------------------------
// Outbound API — open Paddle's hosted customer portal for a customer (IMPURE).
// Paddle is the merchant of record, so the learner manages their payment method,
// downloads invoices and cancels the subscription in Paddle's own portal — we
// never build card-editing or a cancel flow that could silently break a real
// subscription. This only mints the one-time portal URL; the client redirects to
// it. Returns null when Paddle can't be reached or mints nothing, so the caller
// degrades to its honest "manage billing isn't available yet" state.
// ---------------------------------------------------------------------------
export async function createCustomerPortalSession(
  config: PaddleConfig,
  customerId: string,
): Promise<string | null> {
  const res = await fetch(`${config.apiBase}/customers/${customerId}/portal-sessions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({}),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as {
    data?: { urls?: { general?: { overview?: string } } };
  };
  return json.data?.urls?.general?.overview ?? null;
}

// ---------------------------------------------------------------------------
// Outbound API — subscription lifecycle for the cancellation save-flow (IMPURE).
//
// These are the saves a learner can take *instead of* cancelling, plus the cancel
// itself. Paddle is the merchant of record, so it owns the real state change; we
// only call its API and let the resulting webhook flip our subscriptions row (we
// never write entitlement state directly here — the flow is: learner acts →
// Paddle updates → signed webhook → our row). Each returns true on success.
// ---------------------------------------------------------------------------

async function postSubscription(
  config: PaddleConfig,
  subscriptionId: string,
  path: string,
  body?: Record<string, unknown>,
): Promise<boolean> {
  const res = await fetch(`${config.apiBase}/subscriptions/${subscriptionId}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body ?? {}),
  });
  return res.ok;
}

/** Pause a subscription at the end of the current period (Paddle keeps the row). */
export function pauseSubscription(config: PaddleConfig, subscriptionId: string): Promise<boolean> {
  return postSubscription(config, subscriptionId, "/pause", { effective_from: "next_billing_period" });
}

/** Resume a paused subscription. */
export function resumeSubscription(config: PaddleConfig, subscriptionId: string): Promise<boolean> {
  return postSubscription(config, subscriptionId, "/resume");
}

/**
 * Cancel a subscription at the end of the current billing period (the learner
 * keeps Pro until the period ends — the honest, non-punitive default).
 */
export function cancelSubscription(config: PaddleConfig, subscriptionId: string): Promise<boolean> {
  return postSubscription(config, subscriptionId, "/cancel", { effective_from: "next_billing_period" });
}

/** Apply a retention discount to a subscription (the "stay, here's X% off" save). */
export async function applySubscriptionDiscount(
  config: PaddleConfig,
  subscriptionId: string,
  discountId: string,
): Promise<boolean> {
  const res = await fetch(`${config.apiBase}/subscriptions/${subscriptionId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ discount_id: discountId }),
  });
  return res.ok;
}
