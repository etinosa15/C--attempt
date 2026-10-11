import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { DevThemeToggle } from "./DevThemeToggle";
import styles from "./dev.module.css";

// Dev-only design sandbox (Phase 3). These pages exist to prove palette, type,
// and loader decisions on real tokens. They 404 in production so they never ship
// to learners or get indexed.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Forge — dev sandbox",
  robots: { index: false, follow: false },
};

export default function DevLayout({ children }: { children: React.ReactNode }) {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <div className={styles.wrap}>
      <header className={styles.bar}>
        <strong className={styles.brand}>Forge · dev sandbox</strong>
        <nav className={styles.nav}>
          <Link href="/dev/palette">Palette</Link>
          <Link href="/dev/fonts">Fonts</Link>
          <Link href="/dev/loaders">Loaders</Link>
        </nav>
        <DevThemeToggle />
      </header>
      <main className={styles.main}>{children}</main>
    </div>
  );
}
