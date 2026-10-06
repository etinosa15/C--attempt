import type { Metadata } from "next";
import { Leaderboard } from "./Leaderboard";

export const metadata: Metadata = {
  title: "Leaderboard — Forge Code Academy",
  description: "See how your XP stacks up. Opt in to appear — you choose the name, and you can leave any time.",
  // A signed-in, personalized surface; not indexed.
  robots: { index: false, follow: false },
};

// Thin server shell; the board + opt-in flow are a client island (it reads the
// learner's live standing from /api/leaderboard). Opt-in only — see Leaderboard.
export default function LeaderboardPage() {
  return <Leaderboard />;
}
