// Region-aware pricing (PURE half). Paddle is the merchant of record, so the
// *authoritative* localized price for a visitor's country lives in Paddle, not
// here — we must never show a number Paddle wouldn't actually charge. So instead
// of maintaining our own purchasing-power-parity table, we ask Paddle.js's
// PricePreview() (it geolocates by IP) for the real localized, tax-correct totals
// and just read them out. This module maps that response into the three display
// strings the pricing table needs. If anything is missing we return null and the
// page falls back to its static USD pricing.
//
// Turning on genuine regional *discounts* (beyond currency conversion) is a Paddle
// dashboard step — localized pricing / price overrides per country, which Paddle
// binds to the payment country so a VPN can't harvest a cheaper price. Either way,
// what we render here is exactly what checkout will charge.

/** The slice of a Paddle.js PricePreview() result we read (camelCase per Paddle.js). */
export type PricePreviewResult = {
  data?: {
    currencyCode?: string;
    address?: { countryCode?: string } | null;
    details?: {
      lineItems?: Array<{
        price?: { id?: string } | null;
        formattedTotals?: { total?: string } | null;
      }> | null;
    } | null;
  } | null;
};

/** The configured Paddle price IDs for our three sellable prices. */
export type PriceIds = { proMonthly: string; proAnnual: string; lifetime: string };

/** Localized, ready-to-render price strings for the pricing table. */
export type RegionalPrices = {
  country: string | null;
  currency: string | null;
  /** Paddle's formatted total for each price (e.g. "€24.00", "£179.00"). */
  proMonthly: string;
  proAnnual: string;
  lifetime: string;
};

/**
 * Map a PricePreview() response to the three localized display strings, keyed by
 * the price IDs we asked about. Returns null unless all three resolved — a
 * half-localized page (some prices in one currency, some in USD) would mislead,
 * so it's all-or-nothing and the caller keeps its static USD pricing.
 */
export function pickRegionalPrices(
  result: PricePreviewResult,
  priceIds: PriceIds,
): RegionalPrices | null {
  const items = result?.data?.details?.lineItems ?? [];
  const byId = new Map<string, string>();
  for (const li of items) {
    const id = li?.price?.id;
    const total = li?.formattedTotals?.total;
    if (id && total) byId.set(id, total);
  }

  const proMonthly = byId.get(priceIds.proMonthly);
  const proAnnual = byId.get(priceIds.proAnnual);
  const lifetime = byId.get(priceIds.lifetime);
  if (!proMonthly || !proAnnual || !lifetime) return null;

  return {
    country: result?.data?.address?.countryCode ?? null,
    currency: result?.data?.currencyCode ?? null,
    proMonthly,
    proAnnual,
    lifetime,
  };
}
