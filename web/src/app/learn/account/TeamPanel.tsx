"use client";

// The account dashboard's Team panel. Shows only when the learner is actually on a
// team (so it's invisible until Teams/Edu billing creates one) — owners/admins see
// seat usage, members see they're covered by their team. Its own island so the
// dashboard stays a server component and a solo learner never pays for the fetch's
// render path.
import { useEffect, useState } from "react";
import styles from "./account.module.css";

interface SeatUsage {
  total: number;
  used: number;
  available: number;
  over: boolean;
}
interface Team {
  name: string;
  role: string;
  status: string;
  renewalDate: string | null;
  seats: SeatUsage | null;
}

export function TeamPanel() {
  const [team, setTeam] = useState<Team | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/teams", { cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<{ team: Team | null }>) : null))
      .then((d) => alive && d?.team && setTeam(d.team))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // Nothing to show for solo learners (the common case today).
  if (!team) return null;

  return (
    <section className={styles.panel}>
      <h2>Team</h2>
      <p>
        You&apos;re on <strong>{team.name}</strong> as {team.role}. Your Pro access
        is covered by your team&apos;s plan.
      </p>
      {team.seats && (
        <p className={styles.muted}>
          {team.seats.used} of {team.seats.total} seats in use
          {team.seats.available > 0 ? ` · ${team.seats.available} free` : ""}
          {team.seats.over ? " · over seat count" : ""}.
        </p>
      )}
    </section>
  );
}
