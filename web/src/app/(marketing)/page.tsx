import type { Metadata } from "next";
import Link from "next/link";
import { tracks, type Lang } from "@/lib/curriculum";
import styles from "./marketing.module.css";

export const metadata: Metadata = {
  title: "Forge Code Academy — Learn JavaScript & C# by building",
  description:
    "A local-first coding studio for JavaScript and C#. Write real code in the browser, practice with spaced repetition, keep a streak, and sync your progress across devices.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "Forge Code Academy — Learn JavaScript & C# by building",
    description:
      "Write real code in the browser, practice with spaced repetition, and keep the skills. JavaScript and C#, depth over shortcuts.",
    type: "website",
  },
};

const TRACK_ORDER: Lang[] = ["js", "cs"];

const LOOP = [
  { title: "Understand", desc: "Read a tight, plain-language explanation of one idea — no filler, no 40-minute video." },
  { title: "Predict", desc: "Guess what the code does before you run it. Active recall is what makes it stick." },
  { title: "Practice", desc: "Write and run real code in the browser against tests that go green when you're right." },
  { title: "Reflect", desc: "A short recap locks the concept in and feeds the spaced-repetition review queue." },
];

const FEATURES = [
  { title: "Run real code", desc: "JavaScript executes in an isolated Web Worker in your browser — no setup, no account required to start." },
  { title: "Spaced-repetition review", desc: "Concepts resurface right before you'd forget them, so practice turns into lasting skill." },
  { title: "Streaks that motivate", desc: "A daily goal and streak keep momentum without turning learning into a slot machine." },
  { title: "Local-first by default", desc: "Your progress is saved on your device and works offline. Sign in only when you want to sync." },
  { title: "Cross-device sync", desc: "Sign in and your lessons, drafts, and streak follow you from laptop to desktop and back." },
  { title: "Certificates of practice", desc: "Finish a track and generate a shareable certificate — a record of the work you actually did." },
];

export default function Landing() {
  return (
    <>
      <section className={`${styles.container} ${styles.hero}`}>
        <p className={styles.eyebrow}>JavaScript · C#</p>
        <h1 className={styles.heroTitle}>
          Learn to code by <span className="grad">building</span>, not watching
        </h1>
        <p className={styles.heroLead}>
          Forge is a local-first studio for JavaScript and C#. Read one idea, predict
          what the code does, then write and run it for real — and keep the skill with
          spaced-repetition review.
        </p>
        <div className={styles.heroCtas}>
          <Link href="/signup" className={styles.btnPrimary}>
            Create a free account
          </Link>
          <Link href="/learn" className={styles.btnGhost}>
            Try without an account
          </Link>
        </div>
        <p className={styles.heroNote}>
          No credit card. Progress saves on your device — signing in just adds sync.
        </p>
      </section>

      <section id="tracks" className={`${styles.container} ${styles.section}`}>
        <div className={styles.sectionHead}>
          <p className={styles.eyebrow}>Two tracks</p>
          <h2 className={styles.sectionTitle}>Pick a language and start</h2>
          <p className={styles.sectionLead}>
            Each track runs from your first variable to real, working programs — the
            same engine, tuned to how each language actually thinks.
          </p>
        </div>
        <div className={styles.tracks}>
          {TRACK_ORDER.map((lang) => {
            const track = tracks[lang];
            return (
              <article
                key={lang}
                className={styles.trackCard}
                style={{ ["--track" as string]: track.color }}
              >
                <span className={styles.trackTag}>{track.tag}</span>
                <h3 className={styles.trackName}>{track.name}</h3>
                <p className={styles.trackDesc}>{track.description}</p>
                <p className={styles.trackMeta}>{track.lessons.length} lessons</p>
              </article>
            );
          })}
        </div>
      </section>

      <section className={`${styles.container} ${styles.section}`}>
        <div className={styles.sectionHead}>
          <p className={styles.eyebrow}>How it works</p>
          <h2 className={styles.sectionTitle}>A loop built for retention</h2>
          <p className={styles.sectionLead}>
            Every lesson follows the same four beats. It's deliberately more effort
            than watching — that's why it works.
          </p>
        </div>
        <div className={styles.steps}>
          {LOOP.map((s, i) => (
            <div key={s.title} className={styles.step}>
              <span className={styles.stepNum}>{i + 1}</span>
              <h3 className={styles.stepTitle}>{s.title}</h3>
              <p className={styles.stepDesc}>{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className={`${styles.container} ${styles.section}`}>
        <div className={styles.sectionHead}>
          <p className={styles.eyebrow}>What's inside</p>
          <h2 className={styles.sectionTitle}>Everything you need to keep going</h2>
        </div>
        <div className={styles.features}>
          {FEATURES.map((f) => (
            <div key={f.title} className={styles.feature}>
              <h3 className={styles.featureTitle}>
                <span className={styles.featureDot} aria-hidden="true" />
                {f.title}
              </h3>
              <p className={styles.featureDesc}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.container}>
        <div className={styles.ctaBand}>
          <h2>Start your first lesson today</h2>
          <p>
            Begin offline in seconds, or create a free account to sync across your
            devices. Either way, you'll be running real code within minutes.
          </p>
          <div className={styles.heroCtas}>
            <Link href="/signup" className={styles.btnPrimary}>
              Create a free account
            </Link>
            <Link href="/learn" className={styles.btnGhost}>
              Explore the studio
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
