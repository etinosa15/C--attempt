"use client";

import { useState, useSyncExternalStore } from "react";
import { applyThemePref, resolveTheme, readThemePref } from "@/lib/theme";
import styles from "./dev.module.css";

// SSR-safe read of the device theme without a setState-in-effect: the server
// snapshot is "light", the client snapshot reads the saved preference. A render
// bump on click re-runs the snapshot so the label stays in sync.
const emptySubscribe = () => () => {};

export function DevThemeToggle() {
  const [, bump] = useState(0);
  const theme = useSyncExternalStore(
    emptySubscribe,
    () => resolveTheme(readThemePref()),
    () => "light" as const,
  );

  function flip() {
    applyThemePref(theme === "dark" ? "light" : "dark");
    bump((n) => n + 1);
  }

  return (
    <button type="button" onClick={flip} className={styles.themeToggle}>
      {theme === "dark" ? "☀ Light" : "☾ Dark"}
    </button>
  );
}
