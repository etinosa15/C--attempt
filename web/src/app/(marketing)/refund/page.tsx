import type { Metadata } from "next";
import Link from "next/link";
import styles from "../marketing.module.css";

export const metadata: Metadata = {
  title: "Refund policy — Forge Code Academy",
  description:
    "Forge Pro comes with a 30-day, no-questions money-back guarantee. Here's exactly how refunds work, who to ask, and what happens to your access.",
  alternates: { canonical: "/refund" },
};

// Refund policy. A conversion lever as much as a legal page (Boot.dev-style
// 30-day guarantee — see docs/monetization-plan.md), so it's written to remove
// purchase risk, not to hedge it. Paddle is the merchant of record, so it is the
// party that actually issues the refund; we authorize it. Kept plain-language and
// consistent with /terms and /privacy.
export default function Refund() {
  return (
    <section className={`${styles.container} ${styles.section}`}>
      <div className={styles.sectionHead}>
        <p className={styles.eyebrow}>The guarantee</p>
        <h1 className={styles.sectionTitle}>Refund policy</h1>
        <p className={styles.sectionLead}>
          Forge Pro comes with a 30-day, no-questions money-back guarantee. If it
          isn&rsquo;t for you, you get your money back.
        </p>
      </div>

      <article className={styles.prose}>
        <h2>The 30-day guarantee</h2>
        <p>
          Every first-time Pro purchase — monthly, annual, or Lifetime — is covered
          by a 30-day money-back guarantee. If you&rsquo;re not happy for any reason
          within 30 days of your purchase, ask us and we&rsquo;ll refund it in full.
          You don&rsquo;t need to justify it; &ldquo;it wasn&rsquo;t what I
          expected&rdquo; is enough.
        </p>

        <h2>How to request a refund</h2>
        <p>
          Reply to your purchase receipt, or reach out through the project&rsquo;s
          repository, with the email address you used at checkout. We&rsquo;ll
          authorize the refund with Paddle, our payment provider. Refunds return to
          your original payment method; how quickly it appears is up to your bank or
          card provider, usually a few business days.
        </p>

        <h2>Cancelling vs. refunding</h2>
        <p>
          These are different things. <strong>Cancelling</strong> a monthly or annual
          subscription stops the next renewal — you keep Pro until the end of the
          period you&rsquo;ve already paid for, then drop to the Free floor (you never
          lose your account, progress, or streak). <strong>Refunding</strong> reverses
          a charge and ends the paid access it bought. You can cancel any time from
          your account; a refund is the 30-day guarantee above.
        </p>

        <h2>Renewals after the first 30 days</h2>
        <p>
          The guarantee covers your initial purchase. Later automatic renewals of an
          ongoing subscription aren&rsquo;t automatically refundable — so if you know
          you&rsquo;re done, cancel before the renewal date and you won&rsquo;t be
          charged again. That said, if a renewal genuinely caught you by surprise, ask
          us anyway; we&rsquo;d rather you feel fairly treated than hold onto a charge
          you didn&rsquo;t want.
        </p>

        <h2>What happens to your access</h2>
        <p>
          When a refund is issued, your entitlement returns to the Free floor. Your
          account, saved progress, notes, streak, and any certificates you earned stay
          intact — you simply lose the Pro-only features until you upgrade again. You
          can re-subscribe at any time.
        </p>

        <h2>Payments</h2>
        <p>
          Payments and refunds are processed securely by our payment provider — your
          card details are entered on their secure checkout and never touch our
          servers. When you upgrade, they handle the transaction and issue your
          receipt; a refund is returned to the same payment method you used.
        </p>

        <h2>Questions</h2>
        <p>
          This policy sits alongside the{" "}
          <Link href="/terms">Terms of use</Link> and{" "}
          <Link href="/privacy">Privacy &amp; storage</Link> pages. If anything here is
          unclear before you buy, ask first — we&rsquo;d rather answer up front.
        </p>
      </article>
    </section>
  );
}
