// Entitlement types. The `subscriptions` row (see
// web/supabase/migrations/0002_phase2_subscriptions.sql) is the durable stored
// intent; the `Entitlement` here is what the resolver computes from it and what
// the rest of the app gates on. Keep gating decisions reading `Entitlement`, never
// the raw row — the row's `plan`/`status` are not the effective access level.

/** Stored plan intent on the subscription row. */
export type Plan = "trial" | "free" | "pro";

/**
 * Lifecycle status, aligned with the MoR/Stripe vocabulary we adopt later so a
 * payment webhook can write it verbatim.
 */
export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "expired";

/** A row of public.subscriptions, as read through the Supabase client. */
export interface SubscriptionRow {
  user_id: string;
  plan: Plan;
  status: SubscriptionStatus;
  /** ISO timestamp; null once on a paid plan. */
  trial_ends_at: string | null;
  /** ISO timestamp; null while trialing/free. */
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  provider: "paddle" | "paystack" | "stripe" | null;
  provider_customer_id: string | null;
  provider_subscription_id: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * The capability set an effective tier unlocks. Coarse on purpose: lesson-level
 * gating (which specific lessons are free) is a separate policy that reads
 * `tier` — this is the feature-flag layer the paywalls and the runner check.
 */
export interface FeatureSet {
  /** Run C# in the browser (WASM edition — Phase 4). */
  runCsharp: boolean;
  /** The metered AI tutor. */
  aiTutor: boolean;
  /** The spaced-repetition review deck. */
  spacedReview: boolean;
  /** Claim + download track certificates. */
  certificates: boolean;
  /** No daily lesson cap and access to every lesson (vs the free first-chapters floor). */
  unlimitedLessons: boolean;
  /** Cross-device progress sync (vs local-only). */
  crossDeviceSync: boolean;
  /** Streak shield: the streak survives a few missed days (a Pro retention perk). */
  streakShield: boolean;
}

/** The effective, computed entitlement the app gates on. */
export interface Entitlement {
  /** Effective access level after resolving trial/paid/expired state. */
  tier: "pro" | "free";
  /** True while inside an active reverse trial (tier is "pro" but time-boxed). */
  inTrial: boolean;
  /** ISO timestamp the trial ends, or null when not trialing. */
  trialEndsAt: string | null;
  /** Whole days left in the trial (0 once lapsed; null when not trialing). */
  trialDaysLeft: number | null;
  /** Capabilities unlocked at this tier. */
  features: FeatureSet;
}
