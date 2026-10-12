"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV } from "./nav-items";
import { Icon, BrandMark } from "@/components/Icon";
import { useProgress } from "@/lib/progress/useProgress";
import { glassBlur } from "@/lib/glass";
import styles from "./learn.module.css";

function isActive(pathname: string, href: string): boolean {
  if (href === "/learn") return pathname === "/learn";
  return pathname === href || pathname.startsWith(href + "/");
}

// Persistent desktop sidebar (≥1024px). Primary nav lives here so the top bar
// stays slim; the same NAV feeds the mobile drawer. Hidden below 1024px via CSS.
export function Sidebar() {
  const pathname = usePathname() || "/learn";
  const { state } = useProgress();
  const goal = state?.goal ?? 30;

  return (
    <aside className={styles.sidebar} aria-label="Primary" style={glassBlur}>
      <Link href="/learn" className={styles.sidebarBrand}>
        <BrandMark size={26} />
        <span>Forge Code Academy</span>
      </Link>
      <p className={styles.sidebarEyebrow}>Your learning space</p>
      <nav className={styles.sidebarNav}>
        {NAV.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`${styles.sidebarLink} ${active ? styles.sidebarLinkActive : ""}`}
              aria-current={active ? "page" : undefined}
            >
              <Icon icon={item.icon} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className={styles.sidebarFoot}>
        <strong>Small steps, real skills.</strong>
        <span>A little focused practice today goes a long way.</span>
        <span className={styles.sidebarGoal}>Daily goal · {goal} min</span>
      </div>
    </aside>
  );
}
