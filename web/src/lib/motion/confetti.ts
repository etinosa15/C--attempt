import confetti from "canvas-confetti";

/**
 * A short, warm confetti burst for genuine wins (lesson complete, certificate).
 * Uses the Forge palette and self-disables under prefers-reduced-motion. Safe to
 * call on the server (no-op) — it bails if there is no window.
 */
export function celebrate(): void {
  if (typeof window === "undefined") return;
  confetti({
    particleCount: 80,
    spread: 72,
    startVelocity: 38,
    origin: { y: 0.32 },
    scalar: 0.9,
    ticks: 160,
    colors: ["#d1803f", "#b4531e", "#e0b45a", "#f3ece0"],
    disableForReducedMotion: true,
  });
}
