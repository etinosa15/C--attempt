import type { Metadata } from "next";
import Link from "next/link";
import styles from "../marketing.module.css";

export const metadata: Metadata = {
  title: "Terms of use — Forge Code Academy",
  description:
    "The short, plain version of how Forge is offered and used: a free tool for learning JavaScript and C#, provided as is, with your work kept yours.",
  alternates: { canonical: "/terms" },
};

// Terms of use — the SSG re-shell of the vanilla studio's renderTerms
// (public/app.js). Accounts are live, so the optional-accounts clause is
// included. Plain-language terms for a free, local-first educational app.
export default function Terms() {
  return (
    <section className={`${styles.container} ${styles.section}`}>
      <div className={styles.sectionHead}>
        <p className={styles.eyebrow}>The agreement</p>
        <h1 className={styles.sectionTitle}>Terms of use</h1>
        <p className={styles.sectionLead}>
          The short, plain version of how Forge is offered and used.
        </p>
      </div>

      <article className={styles.prose}>
        <h2>Using Forge</h2>
        <p>
          Forge Code Academy is a free tool for learning JavaScript and C#. By
          using it you agree to these terms. If you do not agree, please stop using
          it. These terms may change as Forge grows; continuing to use it after a
          change means you accept the updated version.
        </p>

        <h2>What Forge is</h2>
        <p>
          Forge is an educational project provided as is, for personal learning. It
          is not professional instruction, certification, or advice, and completing
          a track does not guarantee any particular skill level or outcome. Lesson
          content and timings are guidance, not promises.
        </p>

        <h2>Running code is your responsibility</h2>
        <p>
          The local edition compiles and runs C# with your own computer&rsquo;s
          permissions, and JavaScript runs in your browser. You are responsible for
          the code you write, paste, or run. Run only code you understand and trust,
          and keep the local server private to your machine. Forge does not review
          or sandbox the C# you choose to run locally.
        </p>

        <h2>Optional accounts</h2>
        <p>
          An account is optional and created only when you ask. If you forget your
          password, you can request a reset email to set a new one; otherwise keep
          it somewhere safe. You can delete your account and its synced progress at
          any time from the account menu. Do not share an account or use it to store
          anything you are not comfortable keeping on this project&rsquo;s sync
          service. We may suspend an account that is used to attack, overload, or
          abuse the service.
        </p>

        <h2>Your work is yours</h2>
        <p>
          The code, notes, and answers you create stay yours. The Forge name,
          curriculum, lesson text, and interface are the work of this project. You
          may use Forge for your own learning and share what you build, but please
          do not resell Forge itself or present its curriculum as your own.
        </p>

        <h2>Acceptable use</h2>
        <p>
          Use Forge for learning. Do not use it to break the law, to attack or
          overload the service or others, or to attempt to defeat the browser
          isolation that keeps lesson code contained. Automated bulk access and
          attempts to disrupt other learners are not allowed.
        </p>

        <h2>No warranty</h2>
        <p>
          Forge is offered without warranties of any kind, including fitness for a
          particular purpose or that it will be uninterrupted or error free. Your
          progress lives in your browser and in backups you export, so keep your own
          copies of anything important. To the fullest extent allowed by law, the
          project and its contributors are not liable for any loss arising from
          using Forge, including lost progress or anything that results from code
          you run.
        </p>

        <h2>Questions</h2>
        <p>
          These terms sit alongside the{" "}
          <Link href="/privacy">Privacy &amp; storage</Link> page, which explains
          where your data lives. For anything else, see the project&rsquo;s
          repository.
        </p>
      </article>
    </section>
  );
}
