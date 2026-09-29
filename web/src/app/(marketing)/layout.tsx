// Marketing chrome — the public funnel's shared nav + footer. A server component
// (static, indexable); the only dynamic piece is <NavAuth>, a client island that
// personalizes the CTA once hydrated. Wraps the landing (/), pricing shell
// (/pricing) and about (/about). The /learn app shell has its own chrome and does
// not pass through here.
import Link from "next/link";
import { NavAuth } from "./NavAuth";
import styles from "./marketing.module.css";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.shell}>
      <header className={styles.nav}>
        <Link href="/" className={styles.brand}>
          <span className={styles.brandMark} aria-hidden="true" />
          Forge Code Academy
        </Link>
        <nav className={styles.navLinks} aria-label="Primary">
          <Link href="/#tracks" className={styles.navLink}>
            Tracks
          </Link>
          <Link href="/pricing" className={styles.navLink}>
            Pricing
          </Link>
          <Link href="/about" className={styles.navLink}>
            About
          </Link>
        </nav>
        <NavAuth />
      </header>

      <main className={styles.main}>{children}</main>

      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <div className={styles.footerBrand}>
            <Link href="/" className={styles.brand}>
              <span className={styles.brandMark} aria-hidden="true" />
              Forge Code Academy
            </Link>
            <p className={styles.footerTagline}>
              Learn JavaScript and C# by building. Local-first, depth over
              shortcuts, and your progress follows you across devices.
            </p>
          </div>
          <div className={styles.footerCols}>
            <div className={styles.footerCol}>
              <span className={styles.footerColHead}>Product</span>
              <Link href="/#tracks" className={styles.footerLink}>
                Tracks
              </Link>
              <Link href="/pricing" className={styles.footerLink}>
                Pricing
              </Link>
              <Link href="/learn" className={styles.footerLink}>
                Open the studio
              </Link>
              <Link href="/local-setup" className={styles.footerLink}>
                Local C# setup
              </Link>
            </div>
            <div className={styles.footerCol}>
              <span className={styles.footerColHead}>Company</span>
              <Link href="/about" className={styles.footerLink}>
                About
              </Link>
              <Link href="/login" className={styles.footerLink}>
                Sign in
              </Link>
              <Link href="/signup" className={styles.footerLink}>
                Create account
              </Link>
              <Link href="/privacy" className={styles.footerLink}>
                Privacy
              </Link>
              <Link href="/terms" className={styles.footerLink}>
                Terms
              </Link>
              <Link href="/refund" className={styles.footerLink}>
                Refunds
              </Link>
            </div>
          </div>
        </div>
        <p className={styles.footerNote}>
          © {new Date().getFullYear()} Forge Code Academy. Built for learners who
          want to understand the code they write.
        </p>
      </footer>
    </div>
  );
}
