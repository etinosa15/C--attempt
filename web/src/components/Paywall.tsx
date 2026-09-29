"use client";

// A benefit-framed paywall card — the friendly face of the Free floor. Shown where
// a gate bites (a locked lesson's practice beats, a gated certificate) instead of a
// dead end: it names what's on the other side and offers the upgrade, never scolds.
// Adapts its wording to the learner's state — a signed-out visitor is invited to
// start the trial (which unlocks everything for 7 days); a lapsed-Free learner is
// invited to upgrade to Pro. Keep the tone the professional, low-friction one the
// rest of the surface holds.
import Link from "next/link";
import styles from "./Paywall.module.css";

const DEFAULT_BENEFITS = [
  "Every lesson's quiz and coding challenge",
  "Run C# in the browser — no setup",
  "Track certificates when you finish",
  "Progress synced across your devices",
];

export function Paywall({
  signedIn,
  title,
  blurb,
  benefits = DEFAULT_BENEFITS,
}: {
  /** Drives the CTA wording: signed-out learners start the trial; Free upgrades. */
  signedIn: boolean;
  title?: string;
  blurb?: string;
  benefits?: string[];
}) {
  const heading = title ?? "This is a Pro lesson";
  const body =
    blurb ??
    (signedIn
      ? "You're on the Free plan. Upgrade to Pro to practise and complete every lesson across both tracks."
      : "Create a free account to start your 7-day trial — every lesson unlocked, no card required.");
  const ctaLabel = signedIn ? "Upgrade to Pro" : "Start free trial";
  const ctaHref = signedIn ? "/pricing" : "/signup";

  return (
    <div className={styles.card} role="note">
      <span className={styles.badge}>Pro</span>
      <h3 className={styles.title}>{heading}</h3>
      <p className={styles.blurb}>{body}</p>
      <ul className={styles.benefits}>
        {benefits.map((b) => (
          <li key={b}>{b}</li>
        ))}
      </ul>
      <div className={styles.actions}>
        <Link href={ctaHref} className={styles.cta}>
          {ctaLabel}
        </Link>
        <Link href="/pricing" className={styles.secondary}>
          See what's included
        </Link>
      </div>
    </div>
  );
}
