// Cancellation save-flow (PURE). When a learner asks to cancel, we don't just
// shove them out the door — and we never dark-pattern them either. This module
// decides, from the learner's billing state and what the environment can actually
// offer, which genuine alternatives to put in front of them before the real
// "cancel" button that always works.
//
// The offers are ordered least-lossy first (pause > retain at a better price >
// downgrade to Free), and the last one — "downgrade to Free" — is always present,
// because that IS the honest cancellation: they keep their account, streak and
// progress and simply stop paying. Nothing here blocks cancel; the flow always
// ends at "continue to cancel", which hands off to the merchant of record.
//
// The *money* offers (a pause, a retain discount) are business terms and are only
// surfaced when the environment has the config to back them (a Paddle retain
// discount id, and pause-for coupons). Absent that config, only the honest
// downgrade/continue options show — never a promise we can't honor.

import type { SubscriptionRow } from "../entitlements/types";

/** Config that gates which save offers can actually be honored. */
export type SaveOfferConfig = {
  /** A Paddle discount to offer as a "stay, here's X% off" retention sweetener. */
  retentionDiscountId?: string | null;
  /** Whether the MoR supports pausing the subscription (Paddle does). */
  pauseSupported?: boolean;
};

/** One save alternative, already ordered as it should be presented. */
export type SaveOffer = {
  /** Stable id the UI switches on to decide which action a choice triggers. */
  id: "pause" | "discount" | "downgrade";
  title: string;
  detail: string;
  /** A primary button label. */
  cta: string;
};

/** The learner's tenure, used to decide whether a pause is even worth offering. */
function monthsActive(row: SubscriptionRow, now: Date): number {
  const start = Date.parse(row.created_at);
  if (!Number.isFinite(start)) return 0;
  return Math.max(0, (now.getTime() - start) / (30 * 24 * 60 * 60 * 1000));
}

/**
 * Choose the save offers to show, most-valuable-to-learner first. Only ever
 * returns offers that can be honored with the given config; the downgrade (the
 * honest cancel) is always included. Returns [] when there's nothing to save — a
 * learner on the Free floor or a lifetime purchase has no subscription to cancel.
 */
export function planSaveOffers(
  row: SubscriptionRow | null,
  config: SaveOfferConfig = {},
  now: Date = new Date(),
): SaveOffer[] {
  if (!row || !row.provider_subscription_id) return []; // nothing to cancel
  if (row.plan !== "pro") return [];

  const offers: SaveOffer[] = [];

  // 1) Pause — the least lossy (keep everything, resume later). Offered to anyone
  // with a real subscription when the MoR can pause; most keen for shorter tenures
  // still making the habit, but harmless to show always.
  if (config.pauseSupported) {
    offers.push({
      id: "pause",
      title: "Pause instead",
      detail: "Keep your streak and progress, stop the charges, and pick up where you left off whenever you're ready.",
      cta: "Pause my plan",
    });
  }

  // 2) Retain discount — a genuine price break, only when a discount is configured.
  if (config.retentionDiscountId) {
    offers.push({
      id: "discount",
      title: "Stay at a lower price",
      detail: "We'd rather keep you learning than see you go. Take a discount on your next periods — no new commitment.",
      cta: "Apply my discount",
    });
  }

  // 3) Downgrade to Free — the honest cancellation. Always present. Progress,
  // streak and certificates all stay; only the Pro features lock.
  offers.push({
    id: "downgrade",
    title: "Switch to the Free floor",
    detail:
      monthsActive(row, now) >= 3
        ? "You'll keep your account, streak, certificates and progress. The first module of each track stays open — and you can come back to Pro any time."
        : "You'll keep your account, streak and progress. The first module of each track stays open — upgrade again whenever you like.",
    cta: "Switch to Free",
  });

  return offers;
}
