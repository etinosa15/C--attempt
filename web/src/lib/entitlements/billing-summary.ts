// Billing summary (PURE). The account dashboard needs to say, in plain language,
// what plan the learner is on, when it renews (or when the trial ends), and what
// one action moves them forward next — without leaking the subscription row's
// vocabulary ("plan: pro, status: past_due") into the UI. This module is that
// translation, kept free of Supabase/payment SDK so it's unit-testable and so the
// page and any future email/receipt copy read from one source.
//
// It reads BOTH the raw row (for the facts a learner should see: the renewal date,
// a scheduled cancellation) and the resolved Entitlement (for the effective state
// the rest of the app gates on) — because "what we show" (this row) and "what they
// can do" (the resolved tier) are deliberately two different things in this app.
// Money itself is Paddle's: we never compute or display a price here, only dates
// and lifecycle. Managing the payment method / cancelling happens in Paddle's
// hosted portal, so this only ever produces the *intent* to open it.

import type { Entitlement, SubscriptionRow } from "./types";

/** What the dashboard knows about "manage billing with the MoR". */
export type ManageBilling = {
  /** True when there's a real provider subscription to manage/cancel at all. */
  available: boolean;
  /** Paddle (or another MoR) — names the portal we'd send them to. */
  provider: "paddle" | "stripe" | null;
};

/** Every lifecycle the dashboard renders distinctly. */
export type BillingState =
  | "trial" // in the reverse trial
  | "trial_ending" // trial lapsing within the window below
  | "active" // paid, renews on its own
  | "cancelling" // paid, set to cancel at period end
  | "past_due" // a renewal failed; grace period
  | "lifetime" // one-time purchase, never renews
  | "free"; // the floor

/** The ready-to-render billing view model. */
export type BillingSummary = {
  state: BillingState;
  /** Short plan name ("Pro trial", "Forge Pro", "Free"). */
  planLabel: string;
  /** One-line description of the current state, in plain language. */
  detail: string;
  /** The most useful next action, if any. */
  nextAction: { label: string; href: string } | null;
  /** Where the learner goes to manage/cancel the payment method, if applicable. */
  manageBilling: ManageBilling;
  /** ISO date the plan renews / the trial ends / the period lapses, when known. */
  renewalDate: string | null;
};

/** Trials within this many days are surfaced as "ending soon". */
const TRIAL_ENDING_DAYS = 2;

/** Whole days from `now` to an ISO timestamp; null when absent/unparseable. */
function daysUntil(iso: string | null | undefined, now: Date): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return Math.ceil((t - now.getTime()) / (24 * 60 * 60 * 1000));
}

/**
 * Turn the stored row + the resolved entitlement into the dashboard's view model.
 * A `null` row (no subscription yet) is treated as the Free floor: honest, never
 * an error. `now` is injected so the trial/renewal wording is testable.
 */
export function summarizeBilling(
  row: SubscriptionRow | null,
  entitlement: Entitlement,
  now: Date = new Date(),
): BillingSummary {
  // No row at all → the Free floor (matches resolveEntitlement's null handling).
  if (!row) {
    return {
      state: "free",
      planLabel: "Free",
      detail: "You're on the Free floor — the first module of each track, forever.",
      nextAction: { label: "See Pro", href: "/pricing" },
      manageBilling: { available: false, provider: null },
      renewalDate: null,
    };
  }

  const provider = row.provider;
  const hasSubscription = Boolean(row.provider_subscription_id);
  const manageBilling: ManageBilling = { available: hasSubscription, provider };

  // Lifetime: a paid row with no subscription id and no period end never renews.
  if (row.plan === "pro" && row.status === "active" && !hasSubscription && !row.current_period_end) {
    return {
      state: "lifetime",
      planLabel: "Forge Lifetime",
      detail: "You own Forge Pro for life — one payment, every future track included.",
      nextAction: null,
      manageBilling,
      renewalDate: null,
    };
  }

  // Past due: a renewal failed; entitlements are still Pro during the grace window.
  if (row.status === "past_due") {
    return {
      state: "past_due",
      planLabel: "Pro — payment failed",
      detail: "Your last renewal didn't go through. Update your card to keep Pro and your streak.",
      nextAction: { label: "Update payment method", href: "/account" },
      manageBilling,
      renewalDate: row.current_period_end,
    };
  }

  // In the reverse trial (the entitlement says so; the row may still read status
  // 'trialing' and plan 'pro' once converted, so we trust the resolver here).
  if (entitlement.inTrial) {
    const left = entitlement.trialDaysLeft ?? daysUntil(row.trial_ends_at, now);
    const ending = left != null && left <= TRIAL_ENDING_DAYS;
    return {
      state: ending ? "trial_ending" : "trial",
      planLabel: "Pro trial",
      detail:
        left == null
          ? "You're in your free Pro trial."
          : left <= 1
            ? "Your free Pro trial ends today — keep everything by going Pro."
            : `${left} days left in your free Pro trial.`,
      nextAction: { label: "Upgrade to Pro", href: "/pricing" },
      manageBilling,
      renewalDate: row.trial_ends_at,
    };
  }

  // Paid and scheduled to cancel: keep Pro until the period ends, then drop to Free.
  if (row.plan === "pro" && entitlement.tier === "pro" && row.cancel_at_period_end) {
    return {
      state: "cancelling",
      planLabel: "Forge Pro",
      detail: "Your plan is set to cancel. You keep Pro until the period ends, then move to the Free floor.",
      nextAction: { label: "Resume Pro", href: "/pricing" },
      manageBilling,
      renewalDate: row.current_period_end,
    };
  }

  // Paid and renewing normally.
  if (row.plan === "pro" && entitlement.tier === "pro") {
    return {
      state: "active",
      planLabel: "Forge Pro",
      detail: "Your subscription renews automatically. Manage or cancel any time.",
      nextAction: null,
      manageBilling,
      renewalDate: row.current_period_end,
    };
  }

  // Anything else that isn't granting Pro is the floor (lapsed trial, expired,
  // canceled past its period) — never an error, and the streak/progress is intact.
  return {
    state: "free",
    planLabel: "Free",
    detail: "You're on the Free floor — the first module of each track, forever. Your progress and streak are intact.",
    nextAction: { label: "See Pro", href: "/pricing" },
    manageBilling,
    renewalDate: null,
  };
}
