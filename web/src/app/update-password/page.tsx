"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import styles from "../login/auth.module.css";

// Reached from the recovery email (which established a temporary session via
// /auth/confirm). Setting a new password here completes the reset.
export default function UpdatePasswordPage() {
  const router = useRouter();
  const supabase = createClient();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function update(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 10) {
      setError("Use at least 10 characters.");
      return;
    }
    setBusy(true);
    setError("");
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <main className={styles.wrap}>
      <form className={styles.card} onSubmit={update}>
        <h1 className={styles.title}>Set a new password</h1>
        <label className={styles.label}>
          New password (min 10 characters)
          <input className={styles.input} type="password" value={password} required minLength={10}
            onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
        </label>
        {error && <p className={styles.error}>{error}</p>}
        <button className={styles.primary} type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save password"}
        </button>
      </form>
    </main>
  );
}
