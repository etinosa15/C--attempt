// Paystack integration core. Like the Paddle core, the security- and logic-
// critical parts are PURE and unit-tested — signature verification and the webhook
// event -> subscriptions-row mapping take all their inputs as arguments; only the
// env-bound config and the outbound API calls are impure.
//
// Server-only. NEVER import this into a client component: it reads the secret key.
// Paystack is a payment GATEWAY (not a merchant of record), so unlike Paddle we are
// the seller of record — tax (Nigerian VAT) is handled by us, not Paystack. We only
// translate Paystack's webhooks into our server-authoritative subscriptions row
// (via the service-role client) and open its hosted/inline checkout.
import crypto from "node:crypto";
import type { Plan, SubscriptionStatus } from "../entitlements/types";
import type { PaystackTarget } from "./paystack-catalog";

// ---------------------------------------------------------------------------
// Config (env-bound). Absent config => "not configured" and the UI degrades to
// the honest placeholder. Paystack has a single API base; test vs live is decided
// purely by which secret key (sk_test_… / sk_live_…) you use — there is no
// separate sandbox host like Paddle's.
// ---------------------------------------------------------------------------
export type PaystackConfig = {
  secretKey: string;
  apiBase: string;
  /** Derived from the key prefix, for display/debug only. */
  live: boolean;
};

export const PAYSTACK_API_BASE = "https://api.paystack.co";

/** Read Paystack server config from env, or null when the secret key isn't set. */
export function getPaystackConfig(): PaystackConfig | null {
  const secretKey = process.env.PAYSTACK_SECRET_KEY;
  if (!secretKey) return null;
  return { secretKey, apiBase: PAYSTACK_API_BASE, live: secretKey.startsWith("sk_live_") };
}

// ---------------------------------------------------------------------------
// Webhook signature verification (PURE).
//
// Paystack signs every webhook with HMAC-SHA512 of the RAW request body, keyed by
// your SECRET key, hex-encoded in the `x-paystack-signature` header. We compare in
// constant time (timingSafeEqual) — a non-constant-time compare is a timing-oracle
// vulnerability class. Pass the RAW body; re-serializing JSON breaks the hash.
//
// Note: Paystack's scheme carries no timestamp, so there's no replay-window check
// to make here (unlike Paddle). Idempotency is handled by the upsert being
// state-convergent — replaying an event just rewrites the same row.
// ---------------------------------------------------------------------------
export function verifyPaystackSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
): boolean {
  if (!signatureHeader || !secret) return false;
  const expected = crypto.createHmac("sha512", secret).update(rawBody).digest();
  let received: Buffer;
  try {
    received = Buffer.from(signatureHeader.trim(), "hex");
  } catch {
    return false;
  }
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

// ---------------------------------------------------------------------------
// Webhook event -> subscriptions-row write (PURE).
//
// Attribution is the one real wrinkle vs Paddle. Only `charge.success` carries the
// `metadata.user_id` we stamp at checkout; the subscription lifecycle events
// (subscription.*, invoice.*) carry a customer code and a subscription code but NOT
// our user id. So the mapper returns a *discriminated* write:
//
//   { by: "user", userId, … }         — we know the learner (charge.success)
//   { by: "customer", customerCode, … } — only the Paystack customer is known;
//                                          the route resolves it to a user via the
//                                          provider_customer_id stored by an earlier
//                                          charge.success (service-role lookup)
//   null                                — an event we don't act on
//
// This keeps the mapper DB-free (and unit-testable); the single lookup lives in the
// impure webhook route.
// ---------------------------------------------------------------------------

/** The minimal slice of a Paystack webhook event we depend on (defensive: Paystack
 *  nests differently per event, so every field is optional). */
export type PaystackEvent = {
  event?: string;
  data?: {
    status?: string;
    metadata?: { user_id?: string } | string | null;
    customer?: { customer_code?: string | null } | null;
    // On charge.success a subscription charge references a plan object; a one-time
    // (Lifetime) charge has no plan.
    plan?: { plan_code?: string | null } | string | null;
    // Present on subscription.* events.
    subscription_code?: string | null;
    next_payment_date?: string | null;
    // Present on invoice.* events (renewal/dunning), which nest the subscription.
    subscription?: {
      subscription_code?: string | null;
      status?: string | null;
      next_payment_date?: string | null;
    } | null;
  };
};

/** Columns a verified event sets, before we know which key resolves the row. */
type RowColumns = {
  plan: Plan;
  status: SubscriptionStatus;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  provider: "paystack";
  provider_subscription_id: string | null;
};

/** A write keyed either by our user id (charge.success) or by the Paystack customer
 *  code (lifecycle events the route must resolve to a user). */
export type SubscriptionWrite =
  | ({ by: "user"; userId: string; provider_customer_id: string | null } & RowColumns)
  | ({ by: "customer"; customerCode: string } & RowColumns);

/** user_id we stamped in checkout metadata, tolerating Paystack's string|object. */
function metadataUserId(data: NonNullable<PaystackEvent["data"]>): string | undefined {
  const m = data.metadata;
  if (m && typeof m === "object") return m.user_id ?? undefined;
  return undefined;
}

/** Does this charge reference a subscription plan (vs a one-time Lifetime charge)? */
function hasPlan(data: NonNullable<PaystackEvent["data"]>): boolean {
  const p = data.plan;
  if (p && typeof p === "object") return Boolean(p.plan_code);
  return typeof p === "string" ? p.length > 0 : false;
}

/**
 * Translate a verified Paystack event into a subscriptions write, or null when the
 * event doesn't affect entitlement (or can't be attributed).
 */
export function subscriptionWriteFromEvent(event: PaystackEvent): SubscriptionWrite | null {
  const type = event.event;
  const data = event.data;
  if (!type || !data) return null;
  const customerCode = data.customer?.customer_code ?? null;

  switch (type) {
    case "charge.success": {
      const userId = metadataUserId(data);
      if (!userId) return null; // can't attribute without our stamped id
      const subscription = hasPlan(data);
      return {
        by: "user",
        userId,
        provider: "paystack",
        provider_customer_id: customerCode,
        plan: "pro",
        status: "active",
        // A subscription's period end arrives on subscription.create/invoice.update;
        // a one-time Lifetime charge never lapses.
        current_period_end: subscription ? (data.next_payment_date ?? null) : null,
        cancel_at_period_end: false,
        provider_subscription_id: subscription ? (data.subscription_code ?? null) : null,
      };
    }

    case "subscription.create":
      if (!customerCode) return null;
      return {
        by: "customer",
        customerCode,
        provider: "paystack",
        plan: "pro",
        status: "active",
        current_period_end: data.next_payment_date ?? null,
        cancel_at_period_end: false,
        provider_subscription_id: data.subscription_code ?? null,
      };

    // The learner turned off auto-renew: still Pro until the period ends.
    case "subscription.not_renew":
      if (!customerCode) return null;
      return {
        by: "customer",
        customerCode,
        provider: "paystack",
        plan: "pro",
        status: "active",
        current_period_end: data.next_payment_date ?? null,
        cancel_at_period_end: true,
        provider_subscription_id: data.subscription_code ?? null,
      };

    // The subscription actually ended -> drop to the Free floor.
    case "subscription.disable":
      if (!customerCode) return null;
      return {
        by: "customer",
        customerCode,
        provider: "paystack",
        plan: "pro",
        status: "canceled",
        current_period_end: data.next_payment_date ?? null,
        cancel_at_period_end: true,
        provider_subscription_id: data.subscription_code ?? null,
      };

    // Renewal invoices: a failed charge is dunning (past_due keeps grace in the
    // resolver); a successful one re-affirms active + extends the period.
    case "invoice.payment_failed":
      if (!customerCode) return null;
      return {
        by: "customer",
        customerCode,
        provider: "paystack",
        plan: "pro",
        status: "past_due",
        current_period_end: data.subscription?.next_payment_date ?? null,
        cancel_at_period_end: false,
        provider_subscription_id: data.subscription?.subscription_code ?? null,
      };

    case "invoice.update":
      if (!customerCode || data.status !== "success") return null;
      return {
        by: "customer",
        customerCode,
        provider: "paystack",
        plan: "pro",
        status: "active",
        current_period_end: data.subscription?.next_payment_date ?? null,
        cancel_at_period_end: false,
        provider_subscription_id: data.subscription?.subscription_code ?? null,
      };

    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Outbound API — initialize a transaction for the hosted checkout (IMPURE).
//
// We create it server-side so we can stamp metadata.user_id (which rides onto the
// charge.success webhook and lets us attribute the purchase) and attach the plan
// for a subscription. Paystack returns an `authorization_url`; the client
// redirects there (or opens the inline popup with the `access_code`). Granting Pro
// is NOT done here — the verified webhook writes the row.
//
// `target` comes from the pure paystack-catalog; its env values are read here:
//   - plan   -> pass `plan` (the plan's amount + interval drive the subscription)
//   - amount -> pass `amount` in kobo (one-time Lifetime), currency NGN
// Returns the redirect URL + access code, or an error the caller surfaces honestly.
// ---------------------------------------------------------------------------
export async function initializeTransaction(
  config: PaystackConfig,
  target: PaystackTarget,
  userId: string,
  email: string,
  callbackUrl: string,
): Promise<{ authorizationUrl: string; accessCode: string; reference: string } | { error: string }> {
  const body: Record<string, unknown> = {
    email,
    callback_url: callbackUrl,
    metadata: { user_id: userId },
    currency: "NGN",
  };

  if (target.kind === "plan") {
    const planCode = process.env[target.planCodeEnv];
    if (!planCode) return { error: "Plan not configured" };
    body.plan = planCode;
  } else {
    const amount = Number(process.env[target.amountEnv]);
    if (!Number.isFinite(amount) || amount <= 0) return { error: "Amount not configured" };
    body.amount = Math.floor(amount); // kobo
  }

  const res = await fetch(`${config.apiBase}/transaction/initialize`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.secretKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) return { error: `Paystack init failed (${res.status})` };

  const json = (await res.json()) as {
    status?: boolean;
    data?: { authorization_url?: string; access_code?: string; reference?: string };
  };
  const d = json.data;
  if (!json.status || !d?.authorization_url || !d.access_code || !d.reference) {
    return { error: "Paystack response missing checkout data" };
  }
  return { authorizationUrl: d.authorization_url, accessCode: d.access_code, reference: d.reference };
}

// ---------------------------------------------------------------------------
// Outbound API — subscription management for the cancellation save-flow (IMPURE).
//
// Paystack has no Paddle-style hosted portal, so we drive cancellation through its
// API. Disabling a subscription needs BOTH the subscription code and a one-time
// `email_token` Paystack issues per subscription — we fetch the subscription to get
// the token, then disable. As with Paddle, we never write entitlement state here:
// the resulting subscription.disable webhook flips our row. Returns true on success.
// ---------------------------------------------------------------------------
async function paystackGet(config: PaystackConfig, path: string): Promise<unknown | null> {
  const res = await fetch(`${config.apiBase}${path}`, {
    headers: { Authorization: `Bearer ${config.secretKey}` },
  });
  if (!res.ok) return null;
  return res.json();
}

/** Cancel (disable) a subscription by its code — fetches the required email_token. */
export async function disableSubscription(
  config: PaystackConfig,
  subscriptionCode: string,
): Promise<boolean> {
  const fetched = (await paystackGet(config, `/subscription/${subscriptionCode}`)) as {
    data?: { email_token?: string | null };
  } | null;
  const token = fetched?.data?.email_token;
  if (!token) return false;

  const res = await fetch(`${config.apiBase}/subscription/disable`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.secretKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ code: subscriptionCode, token }),
  });
  return res.ok;
}

/** Re-enable a previously disabled subscription (the save-flow's "stay" path). */
export async function enableSubscription(
  config: PaystackConfig,
  subscriptionCode: string,
): Promise<boolean> {
  const fetched = (await paystackGet(config, `/subscription/${subscriptionCode}`)) as {
    data?: { email_token?: string | null };
  } | null;
  const token = fetched?.data?.email_token;
  if (!token) return false;

  const res = await fetch(`${config.apiBase}/subscription/enable`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.secretKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ code: subscriptionCode, token }),
  });
  return res.ok;
}

/** Open Paystack's hosted subscription-management page for a subscription (lets the
 *  learner update their card). Returns the link, or null if it can't be minted. */
export async function manageSubscriptionLink(
  config: PaystackConfig,
  subscriptionCode: string,
): Promise<string | null> {
  const json = (await paystackGet(
    config,
    `/subscription/${subscriptionCode}/manage/link`,
  )) as { data?: { link?: string } } | null;
  return json?.data?.link ?? null;
}
