"use client";

// The interactive half of the account dashboard: the "manage billing" button that
// opens Paddle's hosted customer portal (payment method, invoices, cancel), and
// the single "next step" CTA the summary points at. Paddle is the merchant of
// record, so we never build a card editor or a cancel flow that could silently
// break a real subscription — we mint a one-time portal URL server-side and send
// the learner there.
//
// Degrades honestly: while the server has no provider customer to point at (the
// Free floor / trial), the button is simply absent; if Paddle isn't configured in
// the environment, the button explains rather than dead-ends.
import { useState } from "react";
import Link from "next/link";
import styles from "./account.module.css";

type NextAction = { label: string; href: string } | null;

type PortalResponse =
  | { url: string }
  | { configured: false }
  | { error: string };

export function AccountActions({
  manageAvailable,
  canCancel,
  nextAction,
}: {
  manageAvailable: boolean;
  canCancel: boolean;
  nextAction: NextAction;
}) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function openPortal() {
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const data = (await res.json()) as PortalResponse;
      if ("url" in data && data.url) {
        window.location.href = data.url;
        return;
      }
      if ("configured" in data && data.configured === false) {
        setNote("Billing management isn't live in this build yet — nothing to worry about, your plan is unchanged.");
        return;
      }
      setNote("Could not open the billing portal. Please try again in a moment.");
    } catch {
      setNote("Could not reach billing. Please try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.cta}>
      <div className={styles.actions}>
        {nextAction && (
          <Link className={`${styles.btn} ${styles.btnPrimary}`} href={nextAction.href}>
            {nextAction.label}
          </Link>
        )}
        {manageAvailable && (
          <button type="button" className={styles.btn} onClick={openPortal} disabled={busy}>
            {busy ? "Opening…" : "Manage billing"}
          </button>
        )}
      </div>
      {note && (
        <p className={styles.muted} role="status" aria-live="polite">
          {note}
        </p>
      )}
      {canCancel && (
        <p className={styles.muted}>
          <Link href="/learn/account/cancel" className={styles.quietLink}>
            Cancel plan
          </Link>
        </p>
      )}
    </div>
  );
}
