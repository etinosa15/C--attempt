"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Prefers-reduced-motion, read once per call (safe on the server → false). */
function prefersReducedMotion(): boolean {
  return typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * The stepper that drives every visualization: a current index into `total`
 * steps, with prev/next/reset and optional autoplay. Autoplay is disabled under
 * prefers-reduced-motion (the spec: reduced motion → manual stepping only).
 */
export function useStepper(total: number, intervalMs = 1800) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const atEnd = index >= total - 1;

  const next = useCallback(() => setIndex((i) => (i + 1 < total ? i + 1 : i)), [total]);
  const prev = useCallback(() => setIndex((i) => (i > 0 ? i - 1 : i)), []);
  const reset = useCallback(() => setIndex(0), []);
  const togglePlay = useCallback(() => {
    if (prefersReducedMotion()) return; // manual only
    setPlaying((p) => !p);
  }, []);

  // Clamp if the step count shrinks.
  const totalRef = useRef(total);
  useEffect(() => {
    totalRef.current = total;
    setIndex((i) => Math.min(i, Math.max(0, total - 1)));
  }, [total]);

  // Autoplay tick.
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      setIndex((i) => {
        if (i + 1 < totalRef.current) return i + 1;
        setPlaying(false);
        return i;
      });
    }, intervalMs);
    return () => clearInterval(id);
  }, [playing, intervalMs]);

  return { index, setIndex, next, prev, reset, playing, togglePlay, atEnd };
}
