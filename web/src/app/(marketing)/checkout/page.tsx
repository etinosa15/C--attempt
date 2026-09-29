import type { Metadata } from "next";
import Link from "next/link";
import styles from "../marketing.module.css";

export const metadata: Metadata = {
  title: "Checkout — Forge Code Academy",
  description: "Complete your upgrade to Forge Code Academy Pro.",
  // Not a page we want indexed — it's a transactional stop, and it's a
  // placeholder until the merchant-of-record flow lands.
  robots: { index: false, follow: false },
};

// Placeholder checkout. The pricing CTAs route here with ?plan= and ?billing=,
// so the upgrade path isn't a dead link — but the real merchant-of-record flow
// (Paddle vs Stripe, webhooks that write the subscriptions row via the
// service-role client) is the next unit. Until then this page confirms the
// chosen plan and points learners back to keep studying on their trial/Free
// floor. It reads the plan from the query only to reflect the choice; nothing
// here grants entitlement — that stays server-authoritative.
type Search = { plan?: string; billing?: string };

const PLAN_LABEL: Record<string, string> = {
  pro: "Forge Pro",
  lifetime: "Forge Lifetime",
};

const BILLING_LABEL: Record<string, string> = {
  annual: "billed yearly",
  monthly: "billed monthly",
};

export default async function Checkout({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const { plan, billing } = await searchParams;
  const planName = (plan && PLAN_LABEL[plan]) || "Forge Pro";
  const cycle = billing && BILLING_LABEL[billing];

  return (
    <section className={`${styles.container} ${styles.section}`}>
      <div className={styles.sectionHead}>
        <p className={styles.eyebrow}>Checkout</p>
        <h1 className={styles.sectionTitle}>
          {planName}
          {cycle ? ` — ${cycle}` : ""}
        </h1>
        <p className={styles.sectionLead}>
          Secure checkout is almost here. We&apos;re finishing the payment flow
          with a merchant of record, so tax and receipts are handled properly
          wherever you are.
        </p>
      </div>

      <div className={styles.notice}>
        Payments aren&apos;t live in this build yet. Your account keeps its 7-day
        Pro trial and the Free floor in the meantime — no access is lost.
      </div>

      <p className={styles.trust}>
        Want to keep going while we wire this up?{" "}
        <Link href="/learn" className={styles.footerLink}>
          Jump back into your lessons
        </Link>{" "}
        or{" "}
        <Link href="/pricing" className={styles.footerLink}>
          review the plans
        </Link>
        .
      </p>
    </section>
  );
}
