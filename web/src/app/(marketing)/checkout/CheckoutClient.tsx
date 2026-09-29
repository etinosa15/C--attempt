"use client";

// The interactive half of /checkout. It asks the server to start a Paddle
// transaction for the chosen plan, then opens Paddle's hosted overlay. Paddle is
// the merchant of record; entitlement is granted by the verified webhook, not
// here — so on "completed" we just confirm and send the learner back to /learn,
// where the server re-reads their (now Pro) entitlement.
//
// Degrades honestly: if payments aren't configured in this environment, or the
// price isn't set, it shows the "almost here" placeholder; signed-out visitors
// are pointed at sign-in. Paddle.js is loaded on demand from Paddle's CDN so the
// marketing bundle stays free of it.
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import styles from "../marketing.module.css";

type Props = { plan?: string; billing?: string };

type Status = "loading" | "placeholder" | "signedout" | "opening" | "completed" | "error";

type CheckoutStart =
  | { configured: false }
  | { error: string }
  | { transactionId: string; clientToken: string; environment: "sandbox" | "production" };

// Minimal shape of the global Paddle.js exposes once loaded.
type PaddleGlobal = {
  Environment?: { set: (env: string) => void };
  Initialize: (opts: { token: string; eventCallback?: (e: { name?: string }) => void }) => void;
  Checkout: { open: (opts: { transactionId: string }) => void };
};
declare global {
  interface Window {
    Paddle?: PaddleGlobal;
  }
}

const PADDLE_JS = "https://cdn.paddle.com/paddle/v2/paddle.js";

function loadPaddleJs(): Promise<PaddleGlobal> {
  return new Promise((resolve, reject) => {
    if (window.Paddle) return resolve(window.Paddle);
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${PADDLE_JS}"]`);
    const onLoad = () => (window.Paddle ? resolve(window.Paddle) : reject(new Error("Paddle failed to load")));
    if (existing) {
      existing.addEventListener("load", onLoad, { once: true });
      existing.addEventListener("error", () => reject(new Error("Paddle failed to load")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = PADDLE_JS;
    script.async = true;
    script.addEventListener("load", onLoad, { once: true });
    script.addEventListener("error", () => reject(new Error("Paddle failed to load")), { once: true });
    document.head.appendChild(script);
  });
}

export function CheckoutClient({ plan, billing }: Props) {
  const [status, setStatus] = useState<Status>("loading");
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return; // fire once (also tames React's dev double-invoke)
    started.current = true;

    (async () => {
      let res: Response;
      try {
        res = await fetch("/api/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ plan, billing }),
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
  }, [plan, billing]);

  if (status === "loading" || status === "opening") {
    return (
      <div className={styles.notice}>
        {status === "loading" ? "Starting secure checkout…" : "Complete your purchase in the Paddle window."}
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
