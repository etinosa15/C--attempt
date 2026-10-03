"use client";

// The cancellation save-flow UI. Each offer POSTs a lifecycle action to
// /api/billing/subscription (which reads the learner's own subscription id
// server-side and asks Paddle to make the real change). The last offer — the
// downgrade to Free — is the honest cancellation; it is never hidden, and it takes
// the same real path as the others. Nothing here is a dark pattern: every choice
// does exactly what its label says, and "back to your account" is always one click.
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { SaveOffer } from "@/lib/entitlements/save-offers";
import styles from "../account.module.css";

type Action = "pause" | "resume" | "cancel" | "discount";

/** Map a save offer to the subscription action it performs. */
const OFFER_ACTION: Record<SaveOffer["id"], Action> = {
  pause: "pause",
  discount: "discount",
  downgrade: "cancel",
};

/** Confirmation copy per offer, in the learner's terms. */
const DONE_NOTE: Record<SaveOffer["id"], string> = {
  pause: "Your plan is paused — you keep everything and won't be charged again until you resume.",
  discount: "Your discount is applied to your next periods. Thank you for staying.",
  downgrade: "You're set to move to the Free floor at the end of your period. Nothing is lost.",
};

export function CancelFlow({ offers }: { offers: SaveOffer[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<SaveOffer["id"] | null>(null);
  const [done, setDone] = useState<SaveOffer["id"] | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function choose(offer: SaveOffer) {
    setBusy(offer.id);
    setNote(null);
    try {
      const res = await fetch("/api/billing/subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: OFFER_ACTION[offer.id] }),
      });
      const data = (await res.json()) as { ok?: boolean; configured?: boolean; error?: string };
      if (data.ok) {
        setDone(offer.id);
        return;
      }
      if (data.configured === false) {
        setNote("Plan changes aren't live in this build yet — nothing changed, your plan is unchanged.");
        return;
      }
      setNote(data.error ?? "Could not apply that change. Please try again.");
    } catch {
      setNote("Could not reach billing. Please try again in a moment.");
    } finally {
      setBusy(null);
    }
  }

  if (done) {
    return (
      <section className={styles.panel} data-state="cancelling">
        <p className={styles.detail}>{DONE_NOTE[done]}</p>
        <div className={styles.actions}>
          <a className={`${styles.btn} ${styles.btnPrimary}`} href="/learn/account">
            Back to your account
          </a>
          <a className={styles.btn} href="/learn">
            Keep learning
          </a>
        </div>
      </section>
    );
  }

  return (
    <div className={styles.grid}>
      {offers.map((offer) => (
        <section key={offer.id} className={styles.panel}>
          <h2>{offer.title}</h2>
          <p>{offer.detail}</p>
          <div className={styles.actions}>
            <button
              type="button"
              className={`${styles.btn} ${offer.id === "downgrade" ? "" : styles.btnPrimary}`}
              onClick={() => choose(offer)}
              disabled={busy !== null}
            >
              {busy === offer.id ? "Working…" : offer.cta}
            </button>
          </div>
        </section>
      ))}

      {note && (
        <p className={styles.muted} role="status" aria-live="polite">
          {note}
        </p>
      )}

      <p className={styles.muted}>
        <button
          type="button"
          className={styles.btn}
          onClick={() => router.push("/learn/account")}
        >
          Never mind — take me back
        </button>
      </p>
    </div>
  );
}
