import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getEntitlement, getSubscriptionRow } from "@/lib/entitlements/server";
import { summarizeBilling } from "@/lib/entitlements/billing-summary";
import { AccountActions } from "./AccountActions";
import { ReferralPanel } from "./ReferralPanel";
import { StudentPanel } from "./StudentPanel";
import { TeamPanel } from "./TeamPanel";
import styles from "./account.module.css";

export const metadata: Metadata = {
  title: "Your account — Forge Code Academy",
  description: "Your plan, your billing, and your data — all in one place.",
  // A signed-in surface behind auth; never indexed.
  robots: { index: false, follow: false },
};

// The account & billing dashboard. A server component (per the professional
// low-friction standard) so the plan state renders with no flash and the browser
// receives only what's safe: the resolved entitlement and the *stored* facts a
// learner should see (renewal date, a scheduled cancellation). All money is
// Paddle's — we show dates and lifecycle here, never a price — and managing the
// card / cancelling is delegated to Paddle's hosted portal (AccountActions).
//
// This is the natural home for the growth items that hang off account state:
// referral credit (Phase 3) lands here next, and the cancellation save-flow will
// intercept the "manage billing" path before it leaves for Paddle.
export default async function AccountPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // Account actions require an account; send signed-out visitors to sign in.
  if (!user) redirect("/login");

  const [entitlement, row] = await Promise.all([
    getEntitlement(supabase, user.id),
    getSubscriptionRow(supabase, user.id),
  ]);
  const summary = summarizeBilling(row, entitlement);

  const renews = summary.renewalDate
    ? new Date(summary.renewalDate).toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <div className={styles.eyebrow}>Your account</div>
        <h1 className={styles.title}>Your plan, plainly.</h1>
        <p className={styles.lead}>
          What you&apos;re on, what it costs you next, and where your work lives.
          No surprises, and cancelling is always one honest click away.
        </p>
      </header>

      <div className={styles.grid}>
        <section className={styles.panel} data-state={summary.state}>
          <div className={styles.planHead}>
            <h2>{summary.planLabel}</h2>
            <span className={styles.badge} data-state={summary.state}>
              {STATE_BADGE[summary.state]}
            </span>
          </div>
          <p className={styles.detail}>{summary.detail}</p>
          {renews && (
            <dl className={styles.facts}>
              <dt>{summary.state === "trial" || summary.state === "trial_ending" ? "Trial ends" : "Renews"}</dt>
              <dd>{renews}</dd>
            </dl>
          )}
          <AccountActions
            manageAvailable={summary.manageBilling.available}
            canCancel={summary.manageBilling.available && summary.state !== "cancelling"}
            nextAction={summary.nextAction}
          />
        </section>

        <ReferralPanel />

        <TeamPanel />

        <StudentPanel />

        <section className={styles.panel}>
          <h2>Your data</h2>
          <p>
            Export everything Forge holds about you — progress, notes, code drafts
            and review schedules — as one portable file. It&apos;s yours.
          </p>
          <div className={styles.actions}>
            <a className={styles.btn} href="/api/account/export">
              Export my data
            </a>
          </div>
          <p className={styles.muted}>
            Deleting your account is available from the account menu in the top bar,
            any time, and removes your data for good.
          </p>
        </section>

        <section className={styles.panel}>
          <h2>Local-first, by design</h2>
          <p>
            Your learning works offline and stays on this device. Signing in adds
            cross-device sync — it never takes your data somewhere you can&apos;t
            get it back.
          </p>
          <p className={styles.muted}>
            Appearance and study-buddy preferences stay on this device; they are
            never synced or exported.
          </p>
        </section>
      </div>
    </div>
  );
}

/** Short status chip per lifecycle state. */
const STATE_BADGE: Record<string, string> = {
  trial: "Trial",
  trial_ending: "Trial ending",
  active: "Active",
  cancelling: "Cancelling",
  past_due: "Payment failed",
  lifetime: "Lifetime",
  free: "Free",
};
