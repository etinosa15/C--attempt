// AI-tutor quota (PURE). The plan wants the hosted tutor "metered per-user by
// entitlement so the Anthropic bill is bounded and covered by subscription
// revenue." This is the metering decision, with no I/O: given how many hints a
// learner has already used today and their daily limit, decide whether the next
// hint is allowed and how many remain. The route persists the count (Supabase) and
// gates Pro-only separately; this module just does the arithmetic, so it's
// identical everywhere and unit-testable.

/** Default hints per Pro learner per UTC day. Tunable via env in the route. */
export const TUTOR_DAILY_LIMIT = 20;

/** The UTC day key a usage row is bucketed under ("YYYY-MM-DD"). */
export function utcDayKey(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export interface Quota {
  /** True when the next hint is within budget. */
  allowed: boolean;
  /** Hints already used today (floored at 0). */
  used: number;
  /** Hints left today after this check (floored at 0). */
  remaining: number;
  /** The daily ceiling applied. */
  limit: number;
}

/**
 * Resolve today's usage count into an allow/deny + remaining. `allowed` is
 * `used < limit`; `remaining` never goes negative. A non-positive limit denies
 * everything (a clean kill-switch).
 */
export function resolveQuota(usedToday: number, limit: number = TUTOR_DAILY_LIMIT): Quota {
  const used = Math.max(0, Math.floor(usedToday));
  const cap = Math.max(0, Math.floor(limit));
  const allowed = used < cap;
  return {
    allowed,
    used,
    remaining: Math.max(0, cap - used),
    limit: cap,
  };
}
