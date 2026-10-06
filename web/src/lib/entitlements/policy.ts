// The entitlement resolver — the single source of truth for "what can this user
// do". Pure and time-injected (`now`) so it is fully unit-testable and identical
// on the server (route handlers, RSC) and, when hydrated, the client. Gating code
// must call resolveEntitlement and read the returned Entitlement, never branch on
// the raw subscription row.
//
// Server-authoritative: this runs where the trusted subscription row is read
// (RLS self-read or the service role). The client may render a hydrated copy for
// UX, but access decisions that matter (serving paid lesson content, the AI tutor,
// sync) must be re-resolved server-side — never trust a client-sent entitlement.

import type { Entitlement, FeatureSet, SubscriptionRow } from "./types";

/** Reverse-trial length. Tunable launch lever; A/B (7 vs 14) later. */
export const TRIAL_DAYS = 7;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Everything unlocked. Trial and paid Pro both resolve to this. */
export const PRO_FEATURES: FeatureSet = {
  runCsharp: true,
  aiTutor: true,
  spacedReview: true,
  certificates: true,
  unlimitedLessons: true,
  crossDeviceSync: true,
  streakShield: true,
};

// The post-trial Free floor. Deliberately generous enough to retain (keep the
// streak + review habit, sync across devices) but reserves the headline paid
// value — running C#, the AI tutor, certificates, and the full curriculum. Tune
// this map to move the free/paid line; nothing else needs to change.
export const FREE_FEATURES: FeatureSet = {
  runCsharp: false,
  aiTutor: false,
  spacedReview: true,
  certificates: false,
  unlimitedLessons: false,
  crossDeviceSync: true,
  streakShield: false,
};

function freeEntitlement(): Entitlement {
  return { tier: "free", inTrial: false, trialEndsAt: null, trialDaysLeft: null, features: FREE_FEATURES };
}

function proEntitlement(inTrial: boolean, trialEndsAt: string | null, trialDaysLeft: number | null): Entitlement {
  return { tier: "pro", inTrial, trialEndsAt, trialDaysLeft, features: PRO_FEATURES };
}

/** Whole days from `now` until `iso`, floored at 0. */
function daysUntil(iso: string, now: Date): number {
  const ms = new Date(iso).getTime() - now.getTime();
  return ms <= 0 ? 0 : Math.ceil(ms / MS_PER_DAY);
}

/**
 * Resolve a subscription row into the effective entitlement.
 *
 * A missing row (a legacy account created before the seed trigger, or a read
 * that returned nothing) resolves to the Free floor — the safe default: never
 * grant Pro without a row that says so.
 */
export function resolveEntitlement(row: SubscriptionRow | null | undefined, now: Date = new Date()): Entitlement {
  if (!row) return freeEntitlement();

  switch (row.status) {
    case "active":
    case "past_due": {
      // A paid subscription. `past_due` keeps access during the dunning grace
      // period (the MoR retries the charge); a real cancellation arrives as
      // `canceled`/`expired`. Defensively drop to free if the period has lapsed.
      if (row.current_period_end && new Date(row.current_period_end).getTime() <= now.getTime()) {
        return freeEntitlement();
      }
      return proEntitlement(false, null, null);
    }

    case "trialing": {
      // Reverse trial: full Pro until it lapses, then the Free floor.
      if (row.trial_ends_at && new Date(row.trial_ends_at).getTime() > now.getTime()) {
        return proEntitlement(true, row.trial_ends_at, daysUntil(row.trial_ends_at, now));
      }
      return freeEntitlement();
    }

    case "canceled":
    case "expired":
    default:
      return freeEntitlement();
  }
}
