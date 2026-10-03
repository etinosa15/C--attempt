"use client";

// The referral panel on the account dashboard. Fetches the learner's share code +
// stats from /api/referrals (which mints the code on first view), then offers a
// copyable link and a native share sheet where the platform has one. Kept as its
// own island so the rest of the dashboard stays a server component and a learner
// who never opens this panel never triggers the mint.
import { useEffect, useState } from "react";
import styles from "./account.module.css";

type ReferralData = { code: string; link: string; invited: number; converted: number };

export function ReferralPanel() {
  const [data, setData] = useState<ReferralData | null>(null);
  const [error, setError] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/referrals", { cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<ReferralData>) : Promise.reject()))
      .then((d) => alive && setData(d))
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, []);

  async function copy() {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(data.link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked — the link is visible for manual copy.
    }
  }

  async function share() {
    if (!data) return;
    if (navigator.share) {
      try {
        await navigator.share({ title: "Forge Code Academy", url: data.link });
      } catch {
        // The learner dismissed the sheet — nothing to do.
      }
    } else {
      await copy();
    }
  }

  return (
    <section className={styles.panel}>
      <h2>Invite a friend</h2>
      <p>
        Share your link. When a friend signs up through it, the referral is
        recorded to your account — and ours, so we can reward you both.
      </p>

      {error && (
        <p className={styles.muted}>Couldn&apos;t load your referral link just now. Try again shortly.</p>
      )}

      {!data && !error && <p className={styles.muted}>Preparing your link…</p>}

      {data && (
        <>
          <div className={styles.codeRow}>
            <code className={styles.code}>{data.code}</code>
            <div className={styles.actions}>
              <button type="button" className={styles.btn} onClick={copy}>
                {copied ? "Copied" : "Copy link"}
              </button>
              <button type="button" className={styles.btn} onClick={share}>
                Share
              </button>
            </div>
          </div>
          <p className={styles.muted}>
            {data.invited === 0
              ? "No friends have joined through your link yet."
              : `${data.invited} friend${data.invited === 1 ? "" : "s"} joined` +
                (data.converted > 0
                  ? ` · ${data.converted} went Pro`
                  : " — none on Pro yet.")}
          </p>
        </>
      )}
    </section>
  );
}
