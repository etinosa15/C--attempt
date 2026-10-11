"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Smooths loader visibility so fast operations don't flash a spinner and slow
 * ones don't blink it away. Mirrors the Phase 3C loader spec: wait `delay`ms
 * before showing anything; once shown, keep it up for at least `minVisible`ms.
 *
 *   const show = useDelayedLoading(isRunning);
 *   {show && <Spinner label="Running…" />}
 */
export function useDelayedLoading(loading: boolean, delay = 250, minVisible = 600): boolean {
  const [visible, setVisible] = useState(false);
  const shownAt = useRef<number | null>(null);

  useEffect(() => {
    let showTimer: ReturnType<typeof setTimeout> | undefined;
    let hideTimer: ReturnType<typeof setTimeout> | undefined;

    if (loading) {
      showTimer = setTimeout(() => {
        shownAt.current = Date.now();
        setVisible(true);
      }, delay);
    } else if (shownAt.current !== null) {
      const elapsed = Date.now() - shownAt.current;
      const remaining = Math.max(0, minVisible - elapsed);
      hideTimer = setTimeout(() => {
        shownAt.current = null;
        setVisible(false);
      }, remaining);
    } else {
      setVisible(false);
    }

    return () => {
      if (showTimer) clearTimeout(showTimer);
      if (hideTimer) clearTimeout(hideTimer);
    };
  }, [loading, delay, minVisible]);

  return visible;
}

export default useDelayedLoading;
