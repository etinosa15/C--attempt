import { NextResponse } from "next/server";

export const runtime = "nodejs";

// GET /api/paddle-config — the public config the pricing page needs to ask
// Paddle.js for localized prices (PricePreview): the client token, the
// environment, and the three price IDs. None of these are secret (the client
// token opens the overlay; price IDs appear at checkout) — but the price IDs
// aren't NEXT_PUBLIC_, so they live server-side and are handed out here rather
// than baked into the static bundle, which also lets them be set per-deploy.
//
// Mirrors the checkout route's "fully configured or not at all" stance: unless
// the token and all three prices are present, we report { configured: false }
// and the pricing page keeps its static USD pricing.
export async function GET() {
  const clientToken = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN;
  const proMonthly = process.env.PADDLE_PRICE_PRO_MONTHLY;
  const proAnnual = process.env.PADDLE_PRICE_PRO_ANNUAL;
  const lifetime = process.env.PADDLE_PRICE_LIFETIME;
  const environment = process.env.PADDLE_ENV === "production" ? "production" : "sandbox";

  if (!clientToken || !proMonthly || !proAnnual || !lifetime) {
    return NextResponse.json({ configured: false }, { headers: { "Cache-Control": "no-store" } });
  }

  return NextResponse.json(
    {
      configured: true,
      clientToken,
      environment,
      prices: { proMonthly, proAnnual, lifetime },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
