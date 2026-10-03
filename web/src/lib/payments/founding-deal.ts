// Launch / founding deal (PURE half). A time-boxed launch discount applied through
// a Paddle *discount* (dsc_...). The business terms — how much off, when it ends,
// what to call it — are NOT decided in code: they come from env (resolved by the
// /api/paddle-config route) so they can be set, tuned, or switched off per deploy
// without a code change, exactly like the Paddle price IDs. This module just turns
// that raw config into a resolved deal, or null when there's no live deal to show.
//
// Two things must be real before a deal goes live, so we never advertise something
// we can't honor: a Paddle discount id (so checkout actually applies the discount
// and PricePreview shows the discounted total) and an end date still in the future
// (a launch offer with no end isn't one). The percentage/amount itself lives in the
// Paddle discount — we render Paddle's own discounted totals in the price cards, so
// there's no second place for a number to drift out of sync.

/** Raw founding-deal config as handed to the client (all strings, from env). */
export type FoundingDealConfig = {
  discountId?: string | null;
  deadline?: string | null;
  label?: string | null;
  headline?: string | null;
};

/** A resolved, live founding deal — everything the banner and CTAs need. */
export type FoundingDeal = {
  discountId: string;
  deadline: string;
  label: string;
  headline: string;
  /** Whole days until the deal ends (>= 1 while live), for the countdown. */
  endsInDays: number;
};

const DEFAULT_LABEL = "Founding offer";
const DEFAULT_HEADLINE = "Limited-time launch pricing — lock it in before it ends.";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Resolve raw config into a live founding deal, or null when there's nothing to
 * show. Null unless there's a discount id AND a parseable deadline still in the
 * future (relative to `now`, injected for testability and so the server can
 * re-check it at checkout). Copy falls back to sane defaults, so the only config
 * that must be supplied is the discount id and the end date.
 */
export function resolveFoundingDeal(
  cfg: FoundingDealConfig | null | undefined,
  now: Date,
): FoundingDeal | null {
  const discountId = cfg?.discountId?.trim();
  const deadlineRaw = cfg?.deadline?.trim();
  if (!discountId || !deadlineRaw) return null;

  const ends = Date.parse(deadlineRaw);
  if (!Number.isFinite(ends)) return null;

  const remaining = ends - now.getTime();
  if (remaining <= 0) return null; // the deal has ended

  return {
    discountId,
    deadline: deadlineRaw,
    label: cfg?.label?.trim() || DEFAULT_LABEL,
    headline: cfg?.headline?.trim() || DEFAULT_HEADLINE,
    endsInDays: Math.max(1, Math.ceil(remaining / MS_PER_DAY)),
  };
}
