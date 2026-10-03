"use client";

// The student-discount panel on the account dashboard. Reads /api/student for the
// learner's status and whether verification is live, then either confirms an active
// student discount, points them at the configured provider's verification flow, or
// (when nothing is configured) stays quiet with an honest "not available yet". Its
// own island so the dashboard stays a server component.
import { useEffect, useState } from "react";
import styles from "./account.module.css";

type StudentData = {
  verified: boolean;
  expiresAt: string | null;
  available: boolean;
  verifyUrl: string | null;
};

export function StudentPanel() {
  const [data, setData] = useState<StudentData | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/student", { cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<StudentData>) : null))
      .then((d) => alive && d && setData(d))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // Hide the panel entirely until we know its state — and when a learner is neither
  // verified nor able to verify (nothing configured), there's nothing honest to say.
  if (!data) return null;
  if (!data.verified && !data.available) return null;

  const until = data.expiresAt
    ? new Date(data.expiresAt).toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

  return (
    <section className={styles.panel}>
      <h2>Student discount</h2>
      {data.verified ? (
        <>
          <p>
            Your student status is verified — the student discount applies
            automatically at checkout.
          </p>
          {until && <p className={styles.muted}>Verified through {until}. Re-verify before then to keep it.</p>}
        </>
      ) : (
        <>
          <p>
            Studying? Verify your student status to unlock a student discount on
            Pro. It takes a minute and renews each year.
          </p>
          <div className={styles.actions}>
            {data.verifyUrl && (
              <a className={`${styles.btn} ${styles.btnPrimary}`} href={data.verifyUrl}>
                Verify student status
              </a>
            )}
          </div>
        </>
      )}
    </section>
  );
}
