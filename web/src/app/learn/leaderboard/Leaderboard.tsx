"use client";

// The opt-in XP leaderboard. Nobody appears until they explicitly join, the name
// shown is the learner's own choice (never their email), and leaving is one tap —
// the privacy posture the plan requires for social features. Standing is read live
// from /api/leaderboard; the score is recomputed server-side on join, so the board
// can't be gamed from here.
import { useCallback, useEffect, useState } from "react";
import { MAX_DISPLAY_NAME } from "@/lib/leaderboard/core";
import styles from "./leaderboard.module.css";

interface Entry {
  rank: number;
  displayName: string;
  xp: number;
  level: number;
  title: string;
  isMe: boolean;
}
interface Me {
  optedIn: boolean;
  xp: number;
  rank: number | null;
  displayName: string | null;
}

export function Leaderboard() {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/leaderboard", { cache: "no-store" });
      if (!res.ok) {
        setError(true);
        return;
      }
      const data = (await res.json()) as { entries: Entry[]; me: Me };
      setEntries(data.entries);
      setMe(data.me);
      if (data.me.displayName) setName(data.me.displayName);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function join() {
    setBusy(true);
    try {
      await fetch("/api/leaderboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: name }),
      });
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function leave() {
    setBusy(true);
    try {
      await fetch("/api/leaderboard", { method: "DELETE" });
      await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1 className={styles.title}>Leaderboard</h1>
        <p className={styles.lead}>
          Ranked by XP among learners who opt in. You choose the name shown, and you
          can leave the board any time — nobody appears here by default.
        </p>
      </header>

      {error && <p className={styles.note}>Couldn&apos;t load the leaderboard just now. Try again shortly.</p>}

      {me && (
        <section className={styles.panel}>
          {me.optedIn ? (
            <>
              <p className={styles.youAre}>
                You&apos;re on the board as <strong>{me.displayName}</strong>
                {me.rank != null && (
                  <>
                    {" "}· rank <strong>#{me.rank}</strong>
                  </>
                )}{" "}
                · {me.xp} XP
              </p>
              <div className={styles.joinRow}>
                <input
                  className={styles.input}
                  value={name}
                  maxLength={MAX_DISPLAY_NAME}
                  onChange={(e) => setName(e.target.value)}
                  aria-label="Your name on the board"
                />
                <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={join} disabled={busy}>
                  {busy ? "Saving…" : "Update name"}
                </button>
                <button type="button" className={styles.btn} onClick={leave} disabled={busy}>
                  Leave the board
                </button>
              </div>
            </>
          ) : (
            <>
              <p className={styles.youAre}>Join the board to see where your {me.xp} XP ranks.</p>
              <div className={styles.joinRow}>
                <input
                  className={styles.input}
                  value={name}
                  maxLength={MAX_DISPLAY_NAME}
                  placeholder="Your name on the board"
                  onChange={(e) => setName(e.target.value)}
                  aria-label="Your name on the board"
                />
                <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={join} disabled={busy}>
                  {busy ? "Joining…" : "Join the leaderboard"}
                </button>
              </div>
              <p className={styles.privacy}>Opt-in only. Your email is never shown.</p>
            </>
          )}
        </section>
      )}

      {entries && entries.length > 0 ? (
        <ol className={styles.list}>
          {entries.map((e) => (
            <li key={`${e.rank}-${e.displayName}`} className={`${styles.row} ${e.isMe ? styles.rowMe : ""}`}>
              <span className={styles.rank}>#{e.rank}</span>
              <span className={styles.name}>
                {e.displayName}
                {e.isMe && <span className={styles.youTag}> you</span>}
              </span>
              <span className={styles.levelTag}>
                Lv {e.level} · {e.title}
              </span>
              <span className={styles.xp}>{e.xp} XP</span>
            </li>
          ))}
        </ol>
      ) : (
        entries && <p className={styles.empty}>No one&apos;s on the board yet. Be the first to opt in.</p>
      )}

      {!entries && !error && <p className={styles.loading}>Loading the board…</p>}
    </div>
  );
}
