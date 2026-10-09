// Team entitlement (PURE). A team member inherits Pro through their seat: if their
// membership is active AND the team's subscription is live, they're Pro — no
// personal subscription needed. This mirrors ./policy's resolveEntitlement for the
// team case, and maxEntitlement combines it with the learner's own entitlement so
// the more-privileged of the two wins. Pure + time-injected, like the base resolver.

import { FREE_FEATURES, PRO_FEATURES } from "./policy";
import type { Entitlement } from "./types";

/** The slice of a teams row this resolver reads. */
export interface TeamRow {
  /** Team subscription lifecycle (same vocab as subscriptions). */
  status: string;
  /** End of the team's current paid period (null while open-ended/trialing). */
  current_period_end: string | null;
}

/** The slice of a team_members row this resolver reads. */
export interface TeamMembership {
  /** 'active' occupies a seat and inherits Pro; 'invited'/'removed' do not. */
  status: string;
  role?: string;
}

function freeEntitlement(): Entitlement {
  return { tier: "free", inTrial: false, trialEndsAt: null, trialDaysLeft: null, features: FREE_FEATURES };
}
function proEntitlement(): Entitlement {
  return { tier: "pro", inTrial: false, trialEndsAt: null, trialDaysLeft: null, features: PRO_FEATURES };
}

/**
 * Resolve the entitlement a team membership grants. Pro only when the member is
 * active AND the team subscription is live (active/past_due/trialing and not past
 * its period); anything else is the Free floor. No reverse trial — teams don't
 * reverse-trial; a member's own trial is handled by the base resolver.
 */
export function resolveTeamEntitlement(
  team: TeamRow | null | undefined,
  membership: TeamMembership | null | undefined,
  now: Date = new Date(),
): Entitlement {
  if (!team || !membership || membership.status !== "active") return freeEntitlement();

  switch (team.status) {
    case "active":
    case "past_due":
    case "trialing": {
      // Defensively drop to free once the paid period has lapsed.
      if (team.current_period_end && new Date(team.current_period_end).getTime() <= now.getTime()) {
        return freeEntitlement();
      }
      return proEntitlement();
    }
    case "canceled":
    case "expired":
    default:
      return freeEntitlement();
  }
}

/**
 * The more-privileged of two entitlements. Pro beats Free; on a tie, `a` wins — so
 * passing the learner's OWN entitlement as `a` preserves their reverse-trial
 * countdown when both would grant Pro.
 */
export function maxEntitlement(a: Entitlement, b: Entitlement): Entitlement {
  if (a.tier === "pro") return a;
  if (b.tier === "pro") return b;
  return a;
}
