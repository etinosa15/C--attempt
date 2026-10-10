import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getSubscriptionRow } from "@/lib/entitlements/server";
import { planSaveOffers } from "@/lib/entitlements/save-offers";
import { getPaystackConfig } from "@/lib/payments/paystack";
import { CancelFlow } from "./CancelFlow";
import styles from "../account.module.css";

export const metadata: Metadata = {
  title: "Cancel your plan — Forge Code Academy",
  robots: { index: false, follow: false },
};

// The cancellation save-flow. We never hide the real cancel button — the honest
// "switch to Free" (which keeps the account, streak and progress) is always one of
// the options and the flow always ends at an actual cancellation. The point is only
// to offer genuine, non-dark-pattern alternatives first: pause, or a lower price.
// Which alternatives can be shown is decided server-side from config, so we never
// promise a save we can't honor.
export default async function CancelPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const row = await getSubscriptionRow(supabase, user.id);
  // Paystack (gateway) has no pause and no init-time retention discount; Paddle
  // (MoR) supports both. Only offer saves the active provider can actually honor.
  const onPaystack = Boolean(getPaystackConfig());
  const offers = planSaveOffers(row, {
    pauseSupported: !onPaystack,
    retentionDiscountId: onPaystack ? null : (process.env.PADDLE_RETENTION_DISCOUNT_ID ?? null),
  });

  // Nothing to cancel (Free floor / lifetime / no provider subscription) — send
  // them back to the dashboard rather than showing an empty flow.
  if (offers.length === 0) redirect("/learn/account");

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <div className={styles.eyebrow}>Cancelling</div>
        <h1 className={styles.title}>Sorry to see you go.</h1>
        <p className={styles.lead}>
          No dark patterns here. Below are a couple of ways to keep learning
          without paying full price — and if none fit, cancelling is the last
          button, and it just works.
        </p>
      </header>

      <CancelFlow offers={offers} />

      <p className={styles.muted}>
        Changed your mind?{" "}
        <Link href="/learn/account">Back to your account</Link>.
      </p>
    </div>
  );
}
