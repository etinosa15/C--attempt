// The sellable plan catalog — the pure map from a pricing-page selection
// (?plan=&billing=) to the Paddle price we charge and how it behaves. Kept free
// of env and Paddle SDK so it can be unit-tested and reused on both sides; the
// concrete price IDs live in env and are resolved in ./paddle from `priceEnv`.
//
// Prices themselves are defined in the Paddle dashboard (a manual setup step);
// here we only name which env var holds each price ID and whether the purchase
// is a recurring subscription or a one-time payment (Lifetime).

export type PlanId = "pro" | "lifetime";
export type BillingCycle = "monthly" | "annual";

export type PlanSelection = {
  plan: PlanId;
  /** Only meaningful for `pro`; ignored for the one-time `lifetime` plan. */
  billing?: BillingCycle;
};

export type CatalogEntry = {
  /** Name of the server-only env var holding this plan's Paddle price ID. */
  priceEnv: string;
  /** Recurring subscription vs a single one-time charge (Lifetime). */
  kind: "subscription" | "one_time";
  /** Human label, used in the checkout heading and receipts context. */
  label: string;
};

const CATALOG: Record<string, CatalogEntry> = {
  "pro:monthly": { priceEnv: "PADDLE_PRICE_PRO_MONTHLY", kind: "subscription", label: "Forge Pro — monthly" },
  "pro:annual": { priceEnv: "PADDLE_PRICE_PRO_ANNUAL", kind: "subscription", label: "Forge Pro — annual" },
  lifetime: { priceEnv: "PADDLE_PRICE_LIFETIME", kind: "one_time", label: "Forge Lifetime" },
};

/**
 * Validate and normalize a raw ?plan=&billing= selection into a concrete catalog
 * entry, or null when the combination isn't sellable. Pro defaults to the annual
 * cycle (the pricing page's default); Lifetime ignores billing.
 */
export function resolveSelection(
  plan: string | undefined,
  billing: string | undefined,
): { selection: PlanSelection; entry: CatalogEntry } | null {
  if (plan === "lifetime") {
    return { selection: { plan: "lifetime" }, entry: CATALOG.lifetime };
  }
  if (plan === "pro") {
    const cycle: BillingCycle = billing === "monthly" ? "monthly" : "annual";
    return { selection: { plan: "pro", billing: cycle }, entry: CATALOG[`pro:${cycle}`] };
  }
  return null;
}
