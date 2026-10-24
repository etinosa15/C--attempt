"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useProgress } from "@/lib/progress/useProgress";
import type { Entitlement } from "@/lib/entitlements/types";
import { CommandPalette } from "./CommandPalette";
import { ThemeToggle } from "./ThemeToggle";
import { BrandMark, Icon } from "@/components/Icon";
import { faBars, faXmark } from "@fortawesome/free-solid-svg-icons";
import { NAV } from "./nav-items";
import { glassBlur } from "@/lib/glass";
import styles from "./learn.module.css";

// A short, human sync label so the learner always knows their work is safe. This
// is where account actions live now — signing in/out, exporting and deleting are
// one click from every screen, not hidden in a Settings page (the professional,
// low-friction standard we hold the port to).
function SyncBadge() {
  const { signedIn, status } = useProgress();
  if (!signedIn) return <span className={styles.sync}>Saved on this device</span>;
  const label =
    status === "syncing" ? "Syncing…" : status === "error" ? "Sync paused" : "Saved ✓";
  return (
    <span className={styles.sync} data-status={status}>
      {label}
    </span>
  );
}

// The plan/trial state, one glance from every screen. During the reverse trial it
// counts down (a gentle, honest nudge, not a wall); on the Free floor it invites
// an upgrade; a paid learner sees a quiet "Pro". Paid Pro is the only state
// without an upgrade CTA. Rendered only when signed in — a signed-out learner has
// no account entitlement.
function PlanPill({ entitlement }: { entitlement: Entitlement | null }) {
  if (!entitlement) return null;

  if (entitlement.inTrial) {
    const days = entitlement.trialDaysLeft ?? 0;
    const left = days <= 1 ? "ends today" : `${days} days left`;
    return (
      <Link href="/pricing" className={styles.planPill} data-plan="trial">
        <span className={styles.planPillLabel}>Pro trial · {left}</span>
        <span className={styles.planPillCta}>Upgrade</span>
      </Link>
    );
  }

  if (entitlement.tier === "pro") {
    return (
      <span className={styles.planPill} data-plan="pro">
        <span className={styles.planPillLabel}>Pro</span>
      </span>
    );
  }

  return (
    <Link href="/pricing" className={styles.planPill} data-plan="free">
      <span className={styles.planPillLabel}>Free</span>
      <span className={styles.planPillCta}>Upgrade</span>
    </Link>
  );
}

export function TopBar({
  email,
  entitlement,
}: {
  email: string | null;
  entitlement: Entitlement | null;
}) {
  const router = useRouter();
  const pathname = usePathname() || "/learn";
  const [open, setOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Mobile nav drawer: close on Escape and lock body scroll while open.
  useEffect(() => {
    if (!navOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setNavOpen(false);
    }
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [navOpen]);

  // Close the account menu on an outside click or Escape.
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function deleteAccount() {
    const typed = window.prompt(
      "Delete your account and all progress? This cannot be undone.\n\nType your email address to confirm.",
    );
    if (!typed) return;
    setBusy(true);
    const res = await fetch("/api/account", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmEmail: typed }),
    });
    setBusy(false);
    if (res.ok) {
      router.push("/login");
      router.refresh();
      return;
    }
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (data.error === "confirm") {
      window.alert("That email does not match your account. Nothing was deleted.");
    } else if (data.error === "reauth") {
      window.alert("For your safety, please sign in again, then delete your account within 15 minutes.");
      router.push("/login?next=/learn/account");
    } else {
      window.alert("Could not delete the account. Please try again.");
    }
  }

  return (
    <header className={styles.topbar} style={glassBlur}>
      <button
        type="button"
        className={styles.navToggle}
        aria-label="Menu"
        aria-expanded={navOpen}
        aria-controls="mobile-nav"
        onClick={() => setNavOpen((v) => !v)}
      >
        <Icon icon={faBars} />
      </button>
      <Link href="/learn" className={`${styles.brand} ${styles.brandTop}`}>
        <BrandMark />
        Forge Code Academy
      </Link>

      <div className={styles.actions}>
        <SyncBadge />
        {email && <PlanPill entitlement={entitlement} />}
        <CommandPalette />
        <ThemeToggle />
        {email ? (
          <div className={styles.account} ref={menuRef}>
            <button
              type="button"
              className={styles.accountBtn}
              aria-haspopup="menu"
              aria-expanded={open}
              onClick={() => setOpen((v) => !v)}
            >
              {email}
            </button>
            {open && (
              <div className={styles.menu} role="menu" style={glassBlur}>
                <Link className={styles.menuItem} href="/learn/account" role="menuitem">
                  Account &amp; billing
                </Link>
                <a className={styles.menuItem} href="/api/account/export" role="menuitem">
                  Export my data
                </a>
                <form action="/auth/signout" method="post">
                  <button className={styles.menuItem} type="submit" role="menuitem">
                    Sign out
                  </button>
                </form>
                <button
                  className={`${styles.menuItem} ${styles.menuDanger}`}
                  type="button"
                  role="menuitem"
                  onClick={deleteAccount}
                  disabled={busy}
                >
                  {busy ? "Deleting…" : "Delete account"}
                </button>
              </div>
            )}
          </div>
        ) : (
          <Link href={`/login?next=${encodeURIComponent(pathname)}`} className={styles.signIn}>
            Sign in
          </Link>
        )}
      </div>

      {navOpen && (
        <div className={styles.drawerBackdrop} onClick={() => setNavOpen(false)}>
          <nav
            id="mobile-nav"
            className={styles.drawer}
            aria-label="Primary"
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.drawerHead}>
              <span className={styles.brand}>
                <BrandMark /> Forge
              </span>
              <button
                type="button"
                className={styles.navToggle}
                aria-label="Close menu"
                onClick={() => setNavOpen(false)}
              >
                <Icon icon={faXmark} />
              </button>
            </div>
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={styles.drawerLink}
                onClick={() => setNavOpen(false)}
              >
                <Icon icon={item.icon} />
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      )}
    </header>
  );
}
