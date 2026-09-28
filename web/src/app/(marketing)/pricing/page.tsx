import type { Metadata } from "next";
import Link from "next/link";
import styles from "../marketing.module.css";

export const metadata: Metadata = {
  title: "Pricing — Forge Code Academy",
  description:
    "A preview of Forge Code Academy's plans. Forge is free to use today while paid plans are in the works — no paywalls yet.",
  alternates: { canonical: "/pricing" },
  openGraph: {
    title: "Pricing — Forge Code Academy",
    description: "A preview of Forge Code Academy's upcoming plans. Free to use today.",
    type: "website",
  },
};

// Placeholder pricing shell — the SHAPE of the plans, not live pricing. There is
// deliberately no checkout and no paywall logic here (that arrives in Phase 2 with
// the reverse trial and a merchant-of-record). Numbers are intentionally omitted;
// copy is a draft. The Free tier links to signup because the whole app is free to
// use today; the paid tiers are non-actionable previews.
type Tier = {
  name: string;
  price: string;
  priceNote: string;
  features: string[];
  cta: { label: string; href?: string };
  popular?: boolean;
};

const TIERS: Tier[] = [
  {
    name: "Free",
    price: "Free",
    priceNote: "available today",
    features: [
      "Both tracks — JavaScript and C#",
      "Run JavaScript in the browser",
      "Streaks and daily goals",
      "Local-first progress, works offline",
      "Sync across devices when you sign in",
    ],
    cta: { label: "Get started", href: "/signup" },
  },
  {
    name: "Pro",
    price: "Coming soon",
    priceNote: "plans in the works",
    popular: true,
    features: [
      "Everything in Free",
      "Run C# in the browser",
      "Spaced-repetition review across the whole curriculum",
      "AI tutor that nudges instead of answering",
      "Track certificates",
    ],
    cta: { label: "Coming soon" },
  },
  {
    name: "Lifetime",
    price: "Coming soon",
    priceNote: "founding offer planned",
    features: [
      "Everything in Pro",
      "One payment, no subscription",
      "Every future track and feature",
      "Support an independent, no-nonsense learning tool",
    ],
    cta: { label: "Coming soon" },
  },
];

export default function Pricing() {
  return (
    <section className={`${styles.container} ${styles.section}`}>
      <div className={styles.sectionHead}>
        <p className={styles.eyebrow}>Pricing</p>
        <h1 className={styles.sectionTitle}>Simple plans, once they're ready</h1>
        <p className={styles.sectionLead}>
          A preview of where Forge is headed. Prices and details are still being
          worked out.
        </p>
      </div>

      <p className={styles.notice}>
        <strong>Nothing to pay yet.</strong> Forge is free to use while these plans
        are in the works — there are no paywalls in the studio today. This page is a
        preview so you can see what's coming.
      </p>

      <div className={styles.tiers}>
        {TIERS.map((tier) => (
          <div
            key={tier.name}
            className={`${styles.tier} ${tier.popular ? styles.tierPopular : ""}`}
          >
            {tier.popular && <span className={styles.badge}>Planned favorite</span>}
            <h2 className={styles.tierName}>{tier.name}</h2>
            <div>
              <span className={styles.tierPrice}>{tier.price}</span>
              <span className={styles.tierPriceNote}>{tier.priceNote}</span>
            </div>
            <ul className={styles.tierList}>
              {tier.features.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
            <div className={styles.tierCta}>
              {tier.cta.href ? (
                <Link href={tier.cta.href} className={styles.btnPrimary}>
                  {tier.cta.label}
                </Link>
              ) : (
                <span
                  className={`${styles.btnGhost} ${styles.btnDisabled}`}
                  aria-disabled="true"
                >
                  {tier.cta.label}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      <p className={styles.trust}>
        When paid plans launch they'll come with a money-back guarantee and fair,
        region-aware pricing. Until then, everything you see in the studio is free —{" "}
        <Link href="/learn" className={styles.footerLink}>
          start learning now
        </Link>
        .
      </p>
    </section>
  );
}
