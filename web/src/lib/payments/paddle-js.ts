// Shared Paddle.js loader for the client. Paddle.js is loaded on demand from
// Paddle's CDN so the marketing bundle stays free of it until a page actually
// needs it (the checkout overlay, or the pricing page's localized-price preview).
// Both callers share one loader so there's one script tag and one typed global.

// Minimal shape of the global Paddle.js exposes once loaded — only the methods
// we call. PricePreview geolocates by IP and returns localized, tax-correct totals.
export type PaddleGlobal = {
  Environment?: { set: (env: string) => void };
  Initialize: (opts: { token: string; eventCallback?: (e: { name?: string }) => void }) => void;
  Checkout: { open: (opts: { transactionId: string }) => void };
  PricePreview: (req: {
    items: Array<{ priceId: string; quantity: number }>;
    address?: { countryCode: string };
  }) => Promise<unknown>;
};

declare global {
  interface Window {
    Paddle?: PaddleGlobal;
  }
}

const PADDLE_JS = "https://cdn.paddle.com/paddle/v2/paddle.js";

/** Load Paddle.js once and resolve the global; reuses an in-flight/loaded script. */
export function loadPaddleJs(): Promise<PaddleGlobal> {
  return new Promise((resolve, reject) => {
    if (window.Paddle) return resolve(window.Paddle);
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${PADDLE_JS}"]`);
    const onLoad = () =>
      window.Paddle ? resolve(window.Paddle) : reject(new Error("Paddle failed to load"));
    if (existing) {
      existing.addEventListener("load", onLoad, { once: true });
      existing.addEventListener("error", () => reject(new Error("Paddle failed to load")), {
        once: true,
      });
      return;
    }
    const script = document.createElement("script");
    script.src = PADDLE_JS;
    script.async = true;
    script.addEventListener("load", onLoad, { once: true });
    script.addEventListener("error", () => reject(new Error("Paddle failed to load")), { once: true });
    document.head.appendChild(script);
  });
}
