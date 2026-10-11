// Leaderboard (PURE). The two bits of leaderboard logic that have no I/O: making a
// learner-supplied display name safe to show, and turning raw {name, xp} rows into
// a ranked board (with level + "is this me" flags). Kept dependency-free (reuses
// only the pure level curve) so it's identical server- and client-side and fully
// unit-testable; the data access + XP recompute live in the API route.

import { levelForXp } from "../progress/gamification";

/** Max characters shown on the board — long enough for a real handle, capped. */
export const MAX_DISPLAY_NAME = 24;

/**
 * Make a learner-supplied display name safe for the board: strip control
 * characters AND angle brackets (so the value can never inject markup, regardless
 * of where it's later rendered), collapse runs of whitespace, trim, and cap the
 * length. Falls back to "Anonymous" when nothing usable remains — never empty,
 * never an email leak (the caller passes a chosen handle, not the email).
 */
export function sanitizeDisplayName(raw: string | null | undefined): string {
  if (!raw) return "Anonymous";
  const cleaned = raw
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/[<>]/g, "") // defense-in-depth: no tag injection in any sink
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "Anonymous";
  return cleaned.slice(0, MAX_DISPLAY_NAME);
}

/** A raw board row as stored. */
export interface LeaderboardRow {
  user_id: string;
  display_name: string;
  xp: number;
}

/** A board row ready to render. */
export interface RankedEntry {
  rank: number;
  displayName: string;
  xp: number;
  level: number;
  title: string;
  isMe: boolean;
}

/**
 * Rank rows into a board: highest XP first, ties broken by name (deterministic),
 * with standard competition ranking (equal XP shares a rank, the next rank skips).
 * `meId` marks the caller's own row. Pure — the caller sorts nothing itself.
 */
export function rankLeaderboard(rows: LeaderboardRow[], meId: string | null): RankedEntry[] {
  const sorted = [...rows].sort(
    (a, b) => b.xp - a.xp || a.display_name.localeCompare(b.display_name),
  );
  let rank = 0;
  let seen = 0;
  let prevXp: number | null = null;
  return sorted.map((r) => {
    seen++;
    if (r.xp !== prevXp) {
      rank = seen;
      prevXp = r.xp;
    }
    const lvl = levelForXp(r.xp);
    return {
      rank,
      displayName: r.display_name,
      xp: r.xp,
      level: lvl.level,
      title: lvl.title,
      isMe: r.user_id === meId,
    };
  });
}
