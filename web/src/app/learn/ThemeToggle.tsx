"use client";

import { useEffect, useState } from "react";
import { applyThemePref, readThemePref, type ThemePref } from "@/lib/theme";
import styles from "./learn.module.css";

const ORDER: ThemePref[] = ["system", "light", "dark"];
const LABEL: Record<ThemePref, string> = {
  system: "Auto",
  light: "Light",
  dark: "Dark",
};
const ICON: Record<ThemePref, string> = { system: "◐", light: "☀", dark: "☾" };

// Device-local appearance control. The pre-paint boot script in the root layout
// has already applied the saved preference before this mounts, so we only read it
// once for the label and never touch the DOM on the server. Theme is deliberately
// NOT synced to the account — it follows the device (see lib/theme.ts).
export function ThemeToggle() {
  const [pref, setPref] = useState<ThemePref>("system");

  useEffect(() => {
    setPref(readThemePref());
  }, []);

  function cycle() {
    const next = ORDER[(ORDER.indexOf(pref) + 1) % ORDER.length];
    setPref(next);
    applyThemePref(next);
  }

  return (
    <button
      type="button"
      className={styles.theme}
      onClick={cycle}
      title={`Appearance: ${LABEL[pref]}`}
      aria-label={`Appearance: ${LABEL[pref]}. Click to change.`}
    >
      <span aria-hidden="true">{ICON[pref]}</span>
    </button>
  );
}
