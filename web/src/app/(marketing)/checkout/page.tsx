import type { Metadata } from "next";
import { CheckoutClient } from "./CheckoutClient";
import styles from "../marketing.module.css";

export const metadata: Metadata = {
  title: "Checkout — Forge Code Academy",
  description: "Complete your upgrade to Forge Code Academy Pro.",
  // Not a page we want indexed — it's a transactional stop.
  robots: { index: false, follow: false },
};

// Checkout. A static, noindex server shell renders the plan heading; the
// interactive <CheckoutClient> starts a Paddle transaction (via /api/checkout)
// and opens Paddle's hosted overlay. Paddle is the merchant of record, so it
// handles tax and receipts; entitlement is granted only by the verified webhook
// (/api/webhooks/paddle) writing the subscriptions row via the service role —
// nothing on this page grants access. When Paddle isn't configured in the
// environment, the client degrades to an honest "almost here" placeholder.
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
  const cycle = plan !== "lifetime" && billing ? BILLING_LABEL[billing] : undefined;

  return (
    <section className={`${styles.container} ${styles.section}`}>
      <div className={styles.sectionHead}>
        <p className={styles.eyebrow}>Checkout</p>
        <h1 className={styles.sectionTitle}>
          {planName}
          {cycle ? ` — ${cycle}` : ""}
        </h1>
        <p className={styles.sectionLead}>
          Secure checkout, handled by Paddle as our merchant of record — so tax
          and receipts are correct wherever you are.
        </p>
      </div>

      <CheckoutClient plan={plan} billing={billing} />
    </section>
  );
}
