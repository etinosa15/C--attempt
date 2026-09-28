import type { Metadata } from "next";
import Link from "next/link";
import styles from "../marketing.module.css";

export const metadata: Metadata = {
  title: "Run C# on your computer — Forge Code Academy",
  description:
    "Set up the local edition to compile C# with the .NET SDK on your own machine, and move your progress between the website and the local edition with a backup.",
  alternates: { canonical: "/local-setup" },
};

// Local C# setup — the SSG re-shell of the vanilla studio's renderLocalSetup
// (public/app.js). The online edition runs JavaScript in the browser; the local
// edition also compiles C# with .NET. The download ZIP is generated at build time
// into web/public/downloads/ by web/scripts/build-local-zip.mjs (web's `prebuild`
// step), so Vercel serves it from this same origin — no dependency on the Render
// studio, which is retired at Step 10b.
const DOWNLOAD_URL = "/downloads/forge-local.zip";

export default function LocalSetup() {
  return (
    <section className={`${styles.container} ${styles.section}`}>
      <div className={styles.sectionHead}>
        <p className={styles.eyebrow}>Keep learning in both languages</p>
        <h1 className={styles.sectionTitle}>Run C# on your computer</h1>
        <p className={styles.sectionLead}>
          The online edition runs JavaScript in your browser. The local edition
          also compiles C# with .NET.
        </p>
      </div>

      <article className={styles.prose}>
        <h2>1. Install the tools</h2>
        <p>
          Install{" "}
          <a
            href="https://nodejs.org/en/download"
            target="_blank"
            rel="noopener noreferrer"
          >
            Node.js 20 or newer
          </a>{" "}
          and the{" "}
          <a
            href="https://dotnet.microsoft.com/en-us/download/dotnet/10.0"
            target="_blank"
            rel="noopener noreferrer"
          >
            .NET 10 SDK
          </a>
          . Choose the SDK, not just the runtime. Windows, macOS, and Linux are
          supported.
        </p>

        <h2>2. Open the local edition</h2>
        <p>
          <a className={styles.btnPrimary} href={DOWNLOAD_URL} download>
            Download local edition (.zip)
          </a>
        </p>
        <p>
          Extract the entire ZIP. On Windows, double-click{" "}
          <strong>Start Forge.cmd</strong>. On macOS or Linux, open a terminal in
          the extracted folder and run <code>npm start</code>. Keep the terminal
          open and visit{" "}
          <a
            href="http://localhost:4317"
            target="_blank"
            rel="noopener noreferrer"
          >
            localhost:4317
          </a>
          .
        </p>
        <p>
          C# executes with your computer&rsquo;s permissions. Run code you trust,
          and keep the local server private.
        </p>

        <h2>3. Bring your progress with you</h2>
        <ol>
          <li>
            On this website, open{" "}
            <Link href="/learn/settings">Settings &amp; backups</Link> and export
            your progress.
          </li>
          <li>
            Import that backup in the local edition before continuing your C#
            lessons.
          </li>
          <li>When you finish locally, export again and import on the website.</li>
        </ol>
        <p>
          <strong>Import replaces the receiving edition&rsquo;s progress.</strong>{" "}
          Export any new work there first. The two editions do not sync
          automatically, so finish a transfer before studying in the other edition.
        </p>

        <h2>If the compiler is unavailable</h2>
        <p>
          Confirm that <code>dotnet --list-sdks</code> lists the .NET 10 SDK, then
          restart Forge. Lessons and JavaScript remain available while you set it
          up.
        </p>
      </article>
    </section>
  );
}
