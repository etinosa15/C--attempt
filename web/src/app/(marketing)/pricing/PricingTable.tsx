"use client";

// The interactive pricing table — a client island under the statically-rendered
// /pricing page. It does two things the static shell can't: switch billing period
// (annual default, framed as a monthly-equivalent next to the yearly total, per the
// monetization plan), and adapt each call-to-action to the visitor's real state —
// signed out (start the trial), on the trial (upgrade, with the countdown), on the
// Free floor (upgrade), or already Pro (current plan). Entitlement is read from
// /api/entitlement for UX only; the checkout route re-checks server-side.
//
// Target numbers and tier shapes are from docs/monetization-plan.md (D5) — approximate
// and meant to be A/B tuned later, so they live in one PRICING block here.
import { useEffect, useState } from "react";
import Link from "next/link";
import type { Entitlement } from "@/lib/entitlements/types";
import { loadPaddleJs } from "@/lib/payments/paddle-js";
import {
  pickRegionalPrices,
  type PricePreviewResult,
  type RegionalPrices,
} from "@/lib/payments/pricing-preview";
import {
  resolveFoundingDeal,
  type FoundingDeal,
  type FoundingDealConfig,
} from "@/lib/payments/founding-deal";
import marketing from "../marketing.module.css";
import styles from "./pricing.module.css";

type Billing = "annual" | "monthly";

// Approximate launch pricing (docs/monetization-plan.md D5). Annual is shown as its
// monthly-equivalent with the yearly total as the note; monthly is the anchor above it.
// These are the fallback USD strings; when Paddle is configured the pricing table
// shows Paddle's own localized totals instead (see the regional-pricing effect).
const PRICING = {
  proAnnual: { amount: "$15", unit: "/mo", note: "$180 billed yearly · save 40%" },
  proMonthly: { amount: "$25", unit: "/mo", note: "billed monthly" },
  lifetime: { amount: "$299", unit: "once", note: "one payment, yours forever" },
};

// Config the pricing page needs to ask Paddle for localized prices.
type PaddleConfig =
  | { configured: false }
  | {
      configured: true;
      clientToken: string;
      environment: "sandbox" | "production";
      prices: { proMonthly: string; proAnnual: string; lifetime: string };
      foundingDeal?: FoundingDealConfig;
    };

type Feature = { label: string; soon?: boolean };

const FREE_FEATURES: Feature[] = [
  { label: "First module of each track — JavaScript & C#" },
  { label: "Run JavaScript in the browser" },
  { label: "Spaced-repetition review" },
  { label: "Streaks and daily goals" },
  { label: "Local-first, offline-ready · syncs when you sign in" },
];

const PRO_FEATURES: Feature[] = [
  { label: "The entire JavaScript + C# curriculum" },
  { label: "Every lesson's quiz, challenge & completion" },
  { label: "Track certificates" },
  { label: "Run C# in the browser", soon: true },
  { label: "AI tutor that nudges, not answers", soon: true },
];

const LIFETIME_FEATURES: Feature[] = [
  { label: "Everything in Pro" },
  { label: "One payment — no subscription" },
  { label: "Every future track and feature" },
  { label: "Back an independent, no-nonsense learning tool" },
];

/** What we know about the visitor, distilled to what the CTAs need. */
type Viewer = {
  loading: boolean;
  signedIn: boolean;
  tier: "free" | "pro";
  inTrial: boolean;
  trialDaysLeft: number | null;
};

/** A resolved call to action for a tier card. */
type Cta = { label: string; href?: string; disabled?: boolean; hint?: string };

/** Turn an ISO country code into a readable name ("DE" → "Germany"), code as fallback. */
function regionName(code: string): string {
  try {
    return new Intl.DisplayNames(undefined, { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

function FeatureList({ features }: { features: Feature[] }) {
  return (
    <ul className={marketing.tierList}>
      {features.map((f) => (
        <li key={f.label}>
          {f.label}
          {f.soon && <span className={styles.soon}>soon</span>}
        </li>
      ))}
    </ul>
  );
}

function CtaButton({ cta }: { cta: Cta }) {
  return (
    <div className={marketing.tierCta}>
      {cta.href && !cta.disabled ? (
        <Link href={cta.href} className={marketing.btnPrimary}>
          {cta.label}
        </Link>
      ) : (
        <span
          className={`${marketing.btnGhost} ${marketing.btnDisabled}`}
          aria-disabled="true"
        >
          {cta.label}
        </span>
      )}
      {cta.hint && <p className={styles.ctaHint}>{cta.hint}</p>}
    </div>
  );
}

export function PricingTable() {
  const [billing, setBilling] = useState<Billing>("annual");
  const [viewer, setViewer] = useState<Viewer>({
    loading: true,
    signedIn: false,
    tier: "free",
    inTrial: false,
    trialDaysLeft: null,
  });

  // Localized pricing from Paddle (null = not resolved → static USD strings). The
  // toggle lets a visitor flip back to the standard USD anchors; both the fallback
  // and this override render PRICING, so the UI has one honest "no regional" path.
  const [regional, setRegional] = useState<RegionalPrices | null>(null);
  const [showUsd, setShowUsd] = useState(false);

  // A live launch/founding deal, resolved from Paddle config (null = none / expired).
  // When set, the regional prices below are Paddle's *discounted* totals (we pass the
  // discount into PricePreview), so the banner and the price cards always agree.
  const [deal, setDeal] = useState<FoundingDeal | null>(null);

  // Read the entitlement once for CTA wording. 401 (signed out) is expected and
  // simply means "start the trial"; any error degrades to the signed-out CTAs.
  useEffect(() => {
    let alive = true;
    fetch("/api/entitlement", { cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<Entitlement>) : null))
      .then((ent) => {
        if (!alive) return;
        if (!ent) {
          setViewer({ loading: false, signedIn: false, tier: "free", inTrial: false, trialDaysLeft: null });
          return;
        }
        setViewer({
          loading: false,
          signedIn: true,
          tier: ent.tier,
          inTrial: ent.inTrial,
          trialDaysLeft: ent.trialDaysLeft,
        });
      })
      .catch(() => {
        if (alive) setViewer((v) => ({ ...v, loading: false }));
      });
    return () => {
      alive = false;
    };
  }, []);

  // Ask Paddle for localized, tax-correct totals for the visitor's region. Paddle is
  // the merchant of record, so PricePreview (IP-geolocated) returns exactly what
  // checkout will charge — no homegrown PPP table that could show a price we can't
  // honor. Unconfigured/failed/partial → stays null and the page keeps static USD.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const cfgRes = await fetch("/api/paddle-config", { cache: "no-store" });
        if (!cfgRes.ok) return;
        const cfg = (await cfgRes.json()) as PaddleConfig;
        if (!cfg.configured) return;

        // A live launch deal (if any) discounts the previewed totals, so the cards
        // show exactly what checkout will charge with the discount applied.
        const activeDeal = cfg.foundingDeal
          ? resolveFoundingDeal(cfg.foundingDeal, new Date())
          : null;

        const paddle = await loadPaddleJs();
        paddle.Environment?.set(cfg.environment);
        paddle.Initialize({ token: cfg.clientToken });

        const preview = (await paddle.PricePreview({
          items: [
            { priceId: cfg.prices.proMonthly, quantity: 1 },
            { priceId: cfg.prices.proAnnual, quantity: 1 },
            { priceId: cfg.prices.lifetime, quantity: 1 },
          ],
          ...(activeDeal ? { discountId: activeDeal.discountId } : {}),
        })) as PricePreviewResult;

        const prices = pickRegionalPrices(preview, cfg.prices);
        if (alive && prices) {
          setRegional(prices);
          setDeal(activeDeal);
        }
      } catch {
        // Any failure keeps the static USD pricing — never block the page on Paddle.
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const isPro = viewer.signedIn && viewer.tier === "pro" && !viewer.inTrial;

  // The region-aware values actually rendered. When Paddle resolved a region and the
  // visitor hasn't asked for USD, show Paddle's own formatted totals (annual billed
  // yearly, monthly per-month, lifetime once); otherwise the static USD anchors.
  const useRegional = regional != null && !showUsd;
  const proAnnual = useRegional
    ? { amount: regional.proAnnual, unit: "/yr", note: "billed yearly · save 40%" }
    : PRICING.proAnnual;
  const proMonthly = useRegional
    ? { amount: regional.proMonthly, unit: "/mo", note: "billed monthly" }
    : PRICING.proMonthly;
  const lifetimePrice = useRegional
    ? { amount: regional.lifetime, unit: "once", note: "one payment, yours forever" }
    : PRICING.lifetime;

  // Only surface the launch deal when we're actually rendering the discounted
  // (regional) totals — if the visitor flipped to standard USD, the cards no longer
  // reflect the discount, so the banner and the ?deal=1 CTAs stand down with them.
  const showDeal = deal != null && useRegional;
  const dealParam = showDeal ? "&deal=1" : "";

  const trialHint =
    viewer.inTrial && viewer.trialDaysLeft != null
      ? viewer.trialDaysLeft <= 1
        ? "Your Pro trial ends today"
        : `${viewer.trialDaysLeft} days left in your Pro trial`
      : undefined;

  const freeCta: Cta = viewer.signedIn
    ? { label: "Go to your lessons", href: "/learn" }
    : { label: "Start free", href: "/signup" };

  const proCta: Cta = !viewer.signedIn
    ? { label: "Start 7-day free trial", href: "/signup", hint: "No card required" }
    : isPro
      ? { label: "Your current plan", disabled: true }
      : {
          label: "Upgrade to Pro",
          href: `/checkout?plan=pro&billing=${billing}${dealParam}`,
          hint: trialHint,
        };

  const lifetimeCta: Cta = !viewer.signedIn
    ? { label: "Start free trial", href: "/signup" }
    : isPro
      ? { label: "You're on Pro", disabled: true }
      : { label: "Get lifetime", href: `/checkout?plan=lifetime${dealParam}` };

  const pro = billing === "annual" ? proAnnual : proMonthly;

  return (
    <>
      {showDeal && deal && (
        <div className={styles.foundingBanner} role="status">
          <span className={styles.foundingLabel}>{deal.label}</span>
          <p className={styles.foundingHeadline}>{deal.headline}</p>
          <p className={styles.foundingEnds}>
            {deal.endsInDays <= 1 ? "Ends today" : `Ends in ${deal.endsInDays} days`}
          </p>
        </div>
      )}

      {regional && (
        <p className={styles.regionNote}>
          {regional.country
            ? `Prices shown for ${regionName(regional.country)}${
                regional.currency ? ` (${regional.currency})` : ""
              }.`
            : "Prices shown in your local currency."}{" "}
          <button
            type="button"
            className={styles.regionToggle}
            onClick={() => setShowUsd((v) => !v)}
          >
            {showUsd ? "Show local pricing" : "Show standard (USD) pricing"}
          </button>
        </p>
      )}

      <div className={styles.toggle} role="group" aria-label="Billing period">
        <button
          type="button"
          className={billing === "annual" ? styles.toggleOn : styles.toggleOff}
          aria-pressed={billing === "annual"}
          onClick={() => setBilling("annual")}
        >
          Annual <span className={styles.save}>save 40%</span>
        </button>
        <button
          type="button"
          className={billing === "monthly" ? styles.toggleOn : styles.toggleOff}
          aria-pressed={billing === "monthly"}
          onClick={() => setBilling("monthly")}
        >
          Monthly
        </button>
      </div>

      <div className={marketing.tiers}>
        <div className={marketing.tier}>
          <h2 className={marketing.tierName}>Free</h2>
          <div>
            <span className={marketing.tierPrice}>$0</span>
            <span className={marketing.tierPriceNote}>the forever floor</span>
          </div>
          <FeatureList features={FREE_FEATURES} />
          <CtaButton cta={freeCta} />
        </div>

        <div className={`${marketing.tier} ${marketing.tierPopular}`}>
          <span className={marketing.badge}>Most popular</span>
          <h2 className={marketing.tierName}>Pro</h2>
          <div>
            <span className={marketing.tierPrice}>{pro.amount}</span>
            <span className={styles.unit}>{pro.unit}</span>
            <span className={marketing.tierPriceNote}>{pro.note}</span>
          </div>
          <FeatureList features={PRO_FEATURES} />
          <CtaButton cta={proCta} />
        </div>

        <div className={marketing.tier}>
          <h2 className={marketing.tierName}>Lifetime</h2>
          <div>
            <span className={marketing.tierPrice}>{lifetimePrice.amount}</span>
            <span className={styles.unit}>{lifetimePrice.unit}</span>
            <span className={marketing.tierPriceNote}>{lifetimePrice.note}</span>
          </div>
          <FeatureList features={LIFETIME_FEATURES} />
          <CtaButton cta={lifetimeCta} />
        </div>
      </div>
    </>
  );
}
