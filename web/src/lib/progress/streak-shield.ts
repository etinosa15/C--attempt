// Streak shield (PURE) — a Pro retention perk. The base streak (core.js `streak`)
// breaks the instant a day is missed; the shield lets a learner's streak survive a
// few missed days in its recent run. Computed purely from the same activity map,
// with zero new persisted state (so it never touches the shared core.js schema) —
// the "shield" is simply a budget of forgiven gaps, granted by entitlement.
//
// Semantics match core.js `streak` when the budget is 0:
//   * start today; if today has no activity yet, step back one day for free (a day
//     that isn't over is not a "missed" day),
//   * walk backward counting active days,
//   * an inactive day spends one shield from the budget and the walk continues;
//     once the budget is exhausted, the next inactive day ends the run.
// Only active days count toward the number — a shielded gap bridges, it doesn't add
// — and the total budget (not a per-gap allowance) caps it, so sparse activity
// can't sustain an endless streak.

/** Missed days a Pro streak survives in its recent run. Free streaks get 0. */
export const STREAK_SHIELD_DAYS = 2;

// Local, dependency-free copy of core.js `dayKey` (local-date "YYYY-MM-DD"), kept
// in sync with it — inlined so this module pulls in no browser code and stays
// unit-testable (same pattern as structural-equal.ts vs deep-equal.mjs).
function dayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/**
 * The streak length allowing up to `maxSkips` forgiven missed days. With
 * `maxSkips = 0` this is identical to core.js `streak`.
 */
export function streakWithShield(
  activity: Record<string, unknown>,
  maxSkips: number,
  date: Date = new Date(),
): number {
  const budget = Math.max(0, Math.floor(maxSkips));
  const d = new Date(date);
  // Today not being active yet is free (mirrors the base streak).
  if (!activity[dayKey(d)]) d.setDate(d.getDate() - 1);

  let n = 0;
  let skips = 0;
  let guard = 0;
  while (guard++ < 36600) {
    if (activity[dayKey(d)]) {
      n++;
    } else if (skips < budget) {
      skips++; // spend a shield to bridge this missed day
    } else {
      break; // out of budget — the run ends here
    }
    d.setDate(d.getDate() - 1);
  }
  return n;
}
