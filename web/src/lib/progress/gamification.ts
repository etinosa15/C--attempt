// Gamification (PURE). XP, levels and badges derived entirely from the progress
// the learner already has — completed lessons, solved challenges, passed quizzes,
// maintained review cards, earned certificates — plus the current streak. No new
// persisted state: this reads what's there and turns "I studied" into a visible,
// growing identity (the retention lever the plan calls for).
//
// Dependency-free on purpose (no core.js, no React): identical on every surface and
// fully unit-testable. The caller passes the streak it already computes via core's
// streak(). This is UNIVERSAL retention — every learner earns XP and badges; it is
// not a paid gate. (Streak freezes, a Pro perk, are a separate later unit.)

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

/** Total XP earned so far from all progress. */
export function computeXp(p: ProgressLike): number {
  return (
    (p.completed?.length ?? 0) * XP.lesson +
    (p.solved?.length ?? 0) * XP.challenge +
    countTrue(p.quizzes) * XP.quiz +
    countReviews(p.reviews) * XP.review +
    Object.keys(p.certificates ?? {}).length * XP.certificate
  );
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
    progress: xpForLevel > 0 ? xpIntoLevel / xpForLevel : 0,
  };
}

export interface Badge {
  id: string;
  title: string;
  description: string;
  earned: boolean;
}

interface BadgeDef extends Omit<Badge, "earned"> {
  test: (p: ProgressLike, streakDays: number) => boolean;
}

// Milestones across the whole learning surface — breadth (bilingual), depth
// (challenges), habit (streaks, reviews), and finishing (certificate).
const BADGES: BadgeDef[] = [
  { id: "first-lesson", title: "First steps", description: "Complete your first lesson.", test: (p) => (p.completed?.length ?? 0) >= 1 },
  { id: "ten-lessons", title: "Getting serious", description: "Complete 10 lessons.", test: (p) => (p.completed?.length ?? 0) >= 10 },
  { id: "challenger", title: "Problem solver", description: "Solve 10 coding challenges.", test: (p) => (p.solved?.length ?? 0) >= 10 },
  { id: "quiz-whiz", title: "Quiz whiz", description: "Pass 10 quizzes.", test: (p) => countTrue(p.quizzes) >= 10 },
  { id: "reviewer", title: "Memory keeper", description: "Keep 10 cards in spaced review.", test: (p) => countReviews(p.reviews) >= 10 },
  { id: "bilingual", title: "Bilingual", description: "Complete a lesson in both JavaScript and C#.", test: (p) => hasLang(p.completed, "js-") && hasLang(p.completed, "cs-") },
  { id: "streak-3", title: "Warming up", description: "Reach a 3-day streak.", test: (_p, s) => s >= 3 },
  { id: "streak-7", title: "Week warrior", description: "Reach a 7-day streak.", test: (_p, s) => s >= 7 },
  { id: "streak-30", title: "Unstoppable", description: "Reach a 30-day streak.", test: (_p, s) => s >= 30 },
  { id: "graduate", title: "Graduate", description: "Earn a track certificate.", test: (p) => Object.keys(p.certificates ?? {}).length >= 1 },
];

/** Every badge with its earned state, in display order. */
export function computeBadges(p: ProgressLike, streakDays: number): Badge[] {
  return BADGES.map(({ id, title, description, test }) => ({
    id,
    title,
    description,
    earned: test(p, streakDays),
  }));
}

export interface GameSummary {
  xp: number;
  level: LevelInfo;
  badges: Badge[];
  earnedCount: number;
  totalBadges: number;
}

/** One call for the UI: XP, level, and badges with earned flags. */
export function summarizeGamification(p: ProgressLike, streakDays: number): GameSummary {
  const xp = computeXp(p);
  const badges = computeBadges(p, streakDays);
  return {
    xp,
    level: levelForXp(xp),
    badges,
    earnedCount: badges.filter((b) => b.earned).length,
    totalBadges: badges.length,
  };
}
