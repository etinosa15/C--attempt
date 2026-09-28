import type { Metadata } from "next";
import Link from "next/link";
import styles from "../marketing.module.css";

export const metadata: Metadata = {
  title: "About — Forge Code Academy",
  description:
    "Why Forge exists: a local-first coding studio that teaches JavaScript and C# by having you write and run real code, with depth over shortcuts.",
  alternates: { canonical: "/about" },
  openGraph: {
    title: "About — Forge Code Academy",
    description:
      "A local-first coding studio built for learners who want to understand the code they write.",
    type: "website",
  },
};

export default function About() {
  return (
    <section className={`${styles.container} ${styles.section}`}>
      <div className={styles.sectionHead}>
        <p className={styles.eyebrow}>About</p>
        <h1 className={styles.sectionTitle}>Built for understanding, not just completion</h1>
      </div>

      <div className={styles.prose}>
        <p>
          Most "learn to code" tools optimize for the feeling of progress: long
          videos you nod along to, and lessons you finish without ever being wrong.
          Forge is built on the opposite bet — that you learn a language by predicting
          what code will do, running it, and being corrected in the moment.
        </p>

        <h2>Two languages, one honest loop</h2>
        <p>
          Forge teaches JavaScript and C#. Every lesson follows the same four beats:
          understand one idea, predict the outcome, write and run the code against
          real tests, then reflect. JavaScript runs in an isolated Web Worker right in
          your browser, so you're writing working programs from the first lesson —
          no setup, no environment to fight.
        </p>

        <h2>Local-first, and yours</h2>
        <p>
          Your progress is saved on your device and works completely offline. Signing
          in is optional — it only adds sync across your devices and a durable backup.
          Appearance and other device preferences never leave your machine, and you
          can export everything you've done at any time.
        </p>

        <h2>Depth over shortcuts</h2>
        <p>
          A built-in spaced-repetition review engine resurfaces concepts right before
          you'd forget them, so practice turns into skill that lasts. Streaks and a
          daily goal keep momentum without gimmicks. Finish a track and you can
          generate a certificate — a record of the work you genuinely did.
        </p>

        <h2>Where it's going</h2>
        <p className="dim">
          Forge is free to use today. Paid plans are in the works — running C# in the
          browser, an AI tutor that nudges rather than hands you answers, and more —
          but the core promise won't change: learn by building, keep what you learn,
          and own your progress. See the{" "}
          <Link href="/pricing" className={styles.footerLink}>
            pricing preview
          </Link>{" "}
          for what's coming.
        </p>
      </div>

      <div className={styles.ctaBand} style={{ marginTop: "3rem" }}>
        <h2>Ready to write some code?</h2>
        <p>Start your first lesson in seconds — no account required to begin.</p>
        <div className={styles.heroCtas}>
          <Link href="/learn" className={styles.btnPrimary}>
            Open the studio
          </Link>
          <Link href="/signup" className={styles.btnGhost}>
            Create a free account
          </Link>
        </div>
      </div>
    </section>
  );
}
