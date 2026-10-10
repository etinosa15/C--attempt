"use client";

// The interactive half of /checkout. It asks the server to start a checkout for
// the chosen plan, then either redirects to Paystack's hosted page (our Nigeria-
// first gateway) or opens Paddle's overlay (the merchant-of-record fallback).
// Entitlement is granted by the verified webhook, not here — so on return/completion
// we just confirm and send the learner back to /learn, where the server re-reads
// their (now Pro) entitlement.
//
// Paystack appends ?reference=…&trxref=… to the callback URL, so when we land back
// here with that in the URL we show the confirmation instead of starting a second
// transaction. Degrades honestly: unconfigured/price-unset -> "almost here"
// placeholder; signed-out visitors are pointed at sign-in.
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { loadPaddleJs } from "@/lib/payments/paddle-js";
import styles from "../marketing.module.css";

type Props = { plan?: string; billing?: string; deal?: string };

type Status = "loading" | "placeholder" | "signedout" | "opening" | "redirecting" | "completed" | "error";

type CheckoutStart =
  | { configured: false }
  | { error: string }
  | { provider: "paystack"; redirectUrl: string }
  | { provider?: "paddle"; transactionId: string; clientToken: string; environment: "sandbox" | "production" };

export function CheckoutClient({ plan, billing, deal }: Props) {
  const [status, setStatus] = useState<Status>("loading");
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return; // fire once (also tames React's dev double-invoke)
    started.current = true;

    // Returning from Paystack's hosted page: it appends the transaction reference.
    // Show the confirmation rather than starting a fresh checkout.
    const params = new URLSearchParams(window.location.search);
    if (params.has("reference") || params.has("trxref")) {
      setStatus("completed");
      return;
    }

    (async () => {
      let res: Response;
      try {
        res = await fetch("/api/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ plan, billing, deal }),
        });
      } catch {
        setStatus("error");
        return;
      }
      if (res.status === 401) {
        setStatus("signedout");
        return;
      }
      if (!res.ok) {
        setStatus("error");
        return;
      }
      const data = (await res.json()) as CheckoutStart;
      if ("configured" in data && data.configured === false) {
        setStatus("placeholder");
        return;
      }

      // Paystack: hand off to its hosted checkout.
      if ("redirectUrl" in data && data.redirectUrl) {
        setStatus("redirecting");
        window.location.href = data.redirectUrl;
        return;
      }

      // Paddle: open the hosted overlay.
      if (!("transactionId" in data)) {
        setStatus("error");
        return;
      }
      try {
        const paddle = await loadPaddleJs();
        paddle.Environment?.set(data.environment);
        paddle.Initialize({
          token: data.clientToken,
          eventCallback: (e) => {
            if (e.name === "checkout.completed") setStatus("completed");
          },
        });
        paddle.Checkout.open({ transactionId: data.transactionId });
        setStatus("opening");
      } catch {
        setStatus("error");
      }
    })();
  }, [plan, billing, deal]);

  if (status === "loading" || status === "opening" || status === "redirecting") {
    return (
      <div className={styles.notice}>
        {status === "loading"
          ? "Starting secure checkout…"
          : status === "redirecting"
            ? "Taking you to the secure payment page…"
            : "Complete your purchase in the Paddle window."}
      </div>
    );
  }

  if (status === "completed") {
    return (
      <>
        <div className={styles.notice}>
          You&apos;re all set — welcome to Pro. It can take a moment to activate.
        </div>
        <p className={styles.trust}>
          <Link href="/learn" className={styles.btnPrimary}>
            Go to your lessons
          </Link>
        </p>
      </>
    );
  }

  if (status === "signedout") {
    return (
      <>
        <div className={styles.notice}>Sign in first so we can attach Pro to your account.</div>
        <p className={styles.trust}>
          <Link href="/login" className={styles.btnPrimary}>
            Sign in
          </Link>{" "}
          or{" "}
          <Link href="/signup" className={styles.footerLink}>
            create an account
          </Link>
          .
        </p>
      </>
    );
  }

  if (status === "error") {
    return (
      <>
        <div className={styles.notice}>
          Something went wrong starting checkout. No charge was made — please try again.
        </div>
        <p className={styles.trust}>
          <Link href="/pricing" className={styles.footerLink}>
            Back to plans
          </Link>
        </p>
      </>
    );
  }

  // placeholder — payments not live in this environment yet.
  return (
    <>
      <div className={styles.notice}>
        Payments aren&apos;t live in this build yet. Your account keeps its 7-day Pro trial and the
        Free floor in the meantime — no access is lost.
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
    </>
  );
}
