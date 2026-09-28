import type { Metadata } from "next";
import Link from "next/link";
import styles from "../marketing.module.css";

export const metadata: Metadata = {
  title: "Privacy & storage — Forge Code Academy",
  description:
    "Where your code, notes, and progress live. Forge stores your learning in your browser, includes no trackers, and only syncs when you create an account.",
  alternates: { canonical: "/privacy" },
};

// Privacy & storage — the SSG re-shell of the vanilla studio's renderPrivacy
// (public/app.js). Accounts are live (Supabase), so this renders the
// accounts-enabled variant of the copy. The AI-tutor disclosure is deliberately
// omitted: the hosted tutor is Phase 5 and not live, and the vanilla page shows
// that section only when a tutor origin is actually wired.
export default function Privacy() {
  return (
    <section className={`${styles.container} ${styles.section}`}>
      <div className={styles.sectionHead}>
        <p className={styles.eyebrow}>Your learning data</p>
        <h1 className={styles.sectionTitle}>Privacy &amp; storage</h1>
        <p className={styles.sectionLead}>
          Know where your code, notes, and progress live.
        </p>
      </div>

      <article className={styles.prose}>
        <h2>Saved in this browser</h2>
        <p>
          Forge stores completed lessons, quiz results, code drafts, notes, review
          schedules, project milestones, focus time, and any name you set on a
          completion certificate in browser storage. Creating an account is
          optional; without one, nothing leaves this browser.
        </p>

        <h2>If you create an account</h2>
        <p>
          Signing in is optional and only happens when you ask. An account stores
          your email address, a securely hashed password (the password itself is
          never stored), and the same progress record described above. It is used
          to back up your progress and merge it across your devices. Your
          appearance theme stays on each device and is never uploaded. If you
          forget your password, you can request a reset email and set a new one.
          Logging out removes this account&rsquo;s copy of your progress from the
          device. You can permanently delete your account and its synced progress
          at any time from the account menu; deletion cannot be undone, but your
          progress on this device is kept.
        </p>

        <h2>Where code runs</h2>
        <p>
          JavaScript runs in a browser worker. The DOM lab uses an isolated
          preview frame. On the hosted site, C# code is not submitted to a server;
          use the local edition to compile it on your computer.
        </p>

        <h2>Backups and deletion</h2>
        <p>
          Exported backups contain your notes and code as readable JSON. Keep them
          somewhere you trust. Clearing this site&rsquo;s data in your browser
          deletes its progress and recovery copies. Export a backup first if you
          want to keep your work.
        </p>

        <h2>Site requests</h2>
        <p>
          Forge includes no analytics scripts, advertising trackers, or
          third-party fonts. Your hosting provider may retain ordinary access logs
          when serving the site. Official reference links open external websites
          with their own privacy policies.
        </p>

        <h2>Addresses have separate storage</h2>
        <p>
          Each domain, browser, and local port has its own save. Private browsing
          and browser cleanup can remove saves. Use{" "}
          <Link href="/learn/settings">Settings &amp; backups</Link> when moving
          between the website and the local edition.
        </p>
      </article>

      <p className={styles.prose} style={{ marginTop: "1.5rem" }}>
        <Link href="/terms">Terms of use</Link>
      </p>
    </section>
  );
}
