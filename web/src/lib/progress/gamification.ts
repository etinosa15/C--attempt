// Gamification (PURE). XP, levels and badges derived entirely from the progress
// the learner already has — completed lessons, solved challenges, passed quizzes,
// maintained review cards, earned certificates — plus the current streak. No new
// persisted state: this reads what's there and turns "I studied" into a visible,
// growing identity (the retention lever the plan calls for).
//
// Dependency-free on purpose (no core.js, no React): identical on every surface and
// fully unit-testable. The caller passes the streak it already computes via core's
// streak(). This is UNIVERSAL retention — every learner earns XP and badges; it is
// not a paid gate. (Streak freezes, a Pro perk, live in ./streak-shield.)

/** The slice of progress state these derivations read (ForgeState satisfies it). */
export interface ProgressLike {
  completed?: string[];
  solved?: string[];
  quizzes?: Record<string, boolean>;
  reviews?: Record<string, { count?: number }>;
  certificates?: Record<string, number>;
}

// XP weights — concrete progress markers, tunable in one place. Completing a lesson
// is worth the most per action; reviews are smaller but repeatable, rewarding the
// spaced-repetition habit; a certificate is a big one-time milestone.
export const XP = {
  lesson: 40,
  challenge: 30,
  quiz: 15,
  review: 8,
  certificate: 200,
} as const;

function countTrue(m?: Record<string, boolean>): number {
  if (!m) return 0;
  let n = 0;
  for (const k in m) if (m[k]) n++;
  return n;
}

function countReviews(m?: Record<string, { count?: number }>): number {
  if (!m) return 0;
  let n = 0;
  for (const k in m) if ((m[k]?.count ?? 0) >= 1) n++;
  return n;
}

function hasLang(ids: string[] | undefined, prefix: string): boolean {
  return !!ids?.some((id) => id.startsWith(prefix));
}

/** XP split by where it came from — for a transparent "here's your XP" breakdown. */
export interface XpBreakdown {
  lessons: number;
  challenges: number;
  quizzes: number;
  reviews: number;
  certificates: number;
  total: number;
}

/** Compute XP per source (and the total). computeXp is this total. */
export function xpBreakdown(p: ProgressLike): XpBreakdown {
  const lessons = (p.completed?.length ?? 0) * XP.lesson;
  const challenges = (p.solved?.length ?? 0) * XP.challenge;
  const quizzes = countTrue(p.quizzes) * XP.quiz;
  const reviews = countReviews(p.reviews) * XP.review;
  const certificates = Object.keys(p.certificates ?? {}).length * XP.certificate;
  return {
    lessons,
    challenges,
    quizzes,
    reviews,
    certificates,
    total: lessons + challenges + quizzes + reviews + certificates,
  };
}

/** Total XP earned so far from all progress. */
export function computeXp(p: ProgressLike): number {
  return xpBreakdown(p).total;
}

/**
 * Cumulative XP required to REACH `level`. Triangular, so each level costs 100 XP
 * more than the one before (L1=0, L2=100, L3=300, L4=600, L5=1000, …): quick early
 * wins, a longer climb later.
 */
export function levelThreshold(level: number): number {
  if (level <= 1) return 0;
  return 50 * level * (level - 1);
}

const LEVEL_TITLES = [
  "Novice",
  "Apprentice",
  "Journeyer",
  "Craftsman",
  "Artisan",
  "Expert",
  "Master",
  "Grandmaster",
  "Legend",
];

export interface LevelInfo {
  level: number;
  title: string;
  xp: number;
  /** XP accumulated within the current level. */
  xpIntoLevel: number;
  /** XP span of the current level (reach-this to reach-next). */
  xpForLevel: number;
  /** XP still needed to reach the next level. */
  xpToNext: number;
  /** 0..1 progress toward the next level. */
  progress: number;
}

/** Resolve a total XP into a level, title, and progress toward the next level. */
export function levelForXp(xp: number): LevelInfo {
  const safe = Math.max(0, Math.floor(xp));
  let level = 1;
  while (levelThreshold(level + 1) <= safe) level++;
  const base = levelThreshold(level);
  const xpForLevel = levelThreshold(level + 1) - base;
  const xpIntoLevel = safe - base;
  return {
    level,
    title: LEVEL_TITLES[Math.min(level - 1, LEVEL_TITLES.length - 1)],
    xp: safe,
    xpIntoLevel,
    xpForLevel,
    xpToNext: Math.max(0, xpForLevel - xpIntoLevel),
    progress: xpForLevel > 0 ? xpIntoLevel / xpForLevel : 0,
  };
}

export interface Badge {
  id: string;
  title: string;
  description: string;
  earned: boolean;
  /** Current count toward this badge (e.g. lessons completed so far). */
  current: number;
  /** Count needed to earn it. */
  target: number;
  /** 0..1 progress toward earning. */
  progress: number;
  /** "7 / 10 lessons" for multi-step badges; "" for one-shot (target 1) badges. */
  progressLabel: string;
}

interface BadgeDef {
  id: string;
  title: string;
  description: string;
  target: number;
  /** Plural noun for the progress label ("lessons", "days", …). */
  noun: string;
  /** Current progress count toward {@link target}. */
  measure: (p: ProgressLike, streakDays: number) => number;
}

// Milestones across the whole learning surface — breadth (bilingual), depth
// (challenges), habit (streaks, reviews), and finishing (certificate). Each exposes
// a measure + target so locked badges can show "how close" instead of a blank.
const BADGES: BadgeDef[] = [
  { id: "first-lesson", title: "First steps", description: "Complete your first lesson.", target: 1, noun: "lesson", measure: (p) => p.completed?.length ?? 0 },
  { id: "ten-lessons", title: "Getting serious", description: "Complete 10 lessons.", target: 10, noun: "lessons", measure: (p) => p.completed?.length ?? 0 },
  { id: "challenger", title: "Problem solver", description: "Solve 10 coding challenges.", target: 10, noun: "challenges", measure: (p) => p.solved?.length ?? 0 },
  { id: "quiz-whiz", title: "Quiz whiz", description: "Pass 10 quizzes.", target: 10, noun: "quizzes", measure: (p) => countTrue(p.quizzes) },
  { id: "reviewer", title: "Memory keeper", description: "Keep 10 cards in spaced review.", target: 10, noun: "cards", measure: (p) => countReviews(p.reviews) },
  { id: "bilingual", title: "Bilingual", description: "Complete a lesson in both JavaScript and C#.", target: 2, noun: "languages", measure: (p) => (hasLang(p.completed, "js-") ? 1 : 0) + (hasLang(p.completed, "cs-") ? 1 : 0) },
  { id: "streak-3", title: "Warming up", description: "Reach a 3-day streak.", target: 3, noun: "days", measure: (_p, s) => s },
  { id: "streak-7", title: "Week warrior", description: "Reach a 7-day streak.", target: 7, noun: "days", measure: (_p, s) => s },
  { id: "streak-30", title: "Unstoppable", description: "Reach a 30-day streak.", target: 30, noun: "days", measure: (_p, s) => s },
  { id: "graduate", title: "Graduate", description: "Earn a track certificate.", target: 1, noun: "certificate", measure: (p) => Object.keys(p.certificates ?? {}).length },
];

/** Every badge with earned state + progress toward it, in definition order. */
export function computeBadges(p: ProgressLike, streakDays: number): Badge[] {
  return BADGES.map(({ id, title, description, target, noun, measure }) => {
    const current = Math.max(0, Math.floor(measure(p, streakDays)));
    const earned = current >= target;
    return {
      id,
      title,
      description,
      earned,
      current,
      target,
      progress: target > 0 ? Math.min(1, current / target) : 1,
      // One-shot badges (target 1) read as a plain locked/earned chip — no "0 / 1".
      progressLabel: target > 1 ? `${Math.min(current, target)} / ${target} ${noun}` : "",
    };
  });
}

/**
 * Order badges for display: earned first (in definition order), then locked ones
 * closest to earning first — so the next achievable badge is the most visible nudge.
 */
export function sortBadgesForDisplay(badges: Badge[]): Badge[] {
  return badges
    .map((b, i) => ({ b, i }))
    .sort((x, y) => {
      if (x.b.earned !== y.b.earned) return x.b.earned ? -1 : 1;
      if (!x.b.earned && y.b.progress !== x.b.progress) return y.b.progress - x.b.progress;
      return x.i - y.i; // stable: definition order within a group
    })
    .map(({ b }) => b);
}

export interface GameSummary {
  xp: number;
  breakdown: XpBreakdown;
  level: LevelInfo;
  badges: Badge[];
  earnedCount: number;
  totalBadges: number;
}

/** One call for the UI: XP (+ breakdown), level, and badges with earned flags. */
export function summarizeGamification(p: ProgressLike, streakDays: number): GameSummary {
  const breakdown = xpBreakdown(p);
  const badges = computeBadges(p, streakDays);
  return {
    xp: breakdown.total,
    breakdown,
    level: levelForXp(breakdown.total),
    badges,
    earnedCount: badges.filter((b) => b.earned).length,
    totalBadges: badges.length,
  };
}
