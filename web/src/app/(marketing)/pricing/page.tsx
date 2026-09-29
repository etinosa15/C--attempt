import type { Metadata } from "next";
import Link from "next/link";
import { PricingTable } from "./PricingTable";
import styles from "../marketing.module.css";

export const metadata: Metadata = {
  title: "Pricing — Forge Code Academy",
  description:
    "Start free with a 7-day Pro trial — no card required. Then keep the Free floor forever, or go Pro for the full JavaScript and C# curriculum, the in-browser C# runner, spaced review, and certificates.",
  alternates: { canonical: "/pricing" },
  openGraph: {
    title: "Pricing — Forge Code Academy",
    description:
      "Every new account starts with 7 days of Pro, free. Keep learning on the Free floor, or upgrade for the whole curriculum.",
    type: "website",
  },
};

// The live pricing surface. The tier shapes, feature lists and target numbers come
// from docs/monetization-plan.md (D5); the interactive parts — the billing toggle
// and the entitlement-aware CTAs — live in <PricingTable> (a client island) so this
// page stays statically rendered for crawlers while a signed-in learner still sees
// the right call to action ("Current plan" / "Upgrade" / trial state). Checkout
// itself is the next unit; the upgrade CTAs route to /checkout, which is a
// placeholder until the merchant-of-record flow lands.
export default function Pricing() {
  return (
    <section className={`${styles.container} ${styles.section}`}>
      <div className={styles.sectionHead}>
        <p className={styles.eyebrow}>Pricing</p>
        <h1 className={styles.sectionTitle}>Start free. Go Pro when you&apos;re ready.</h1>
        <p className={styles.sectionLead}>
          Every new account gets 7 days of Pro — the whole curriculum, unlocked, no
          card required. After that, keep going on the Free floor or upgrade any time.
        </p>
      </div>

      <PricingTable />

      <p className={styles.trust}>
        Pro comes with a{" "}
        <Link href="/refund" className={styles.footerLink}>
          30-day money-back guarantee
        </Link>
        , and region-aware pricing is on the way. Prefer to just start?{" "}
        <a href="/learn" className={styles.footerLink}>
          Jump into the lessons
        </a>
        .
      </p>
    </section>
  );
}
