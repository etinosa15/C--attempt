"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import styles from "../login/auth.module.css";

export default function ResetPage() {
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function requestReset(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/confirm?next=/update-password`,
    });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setSent(true);
  }

  if (sent)
    return (
      <main className={styles.wrap}>
        <div className={styles.card}>
          <h1 className={styles.title}>Check your email</h1>
          <p>If an account exists for <strong>{email}</strong>, a reset link is on its way.</p>
          <p className={styles.links}><Link href="/login">Back to sign in</Link></p>
        </div>
      </main>
    );

  return (
    <main className={styles.wrap}>
      <form className={styles.card} onSubmit={requestReset}>
        <h1 className={styles.title}>Reset password</h1>
        <label className={styles.label}>
          Email
          <input className={styles.input} type="email" value={email} required
            onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </label>
        {error && <p className={styles.error}>{error}</p>}
        <button className={styles.primary} type="submit" disabled={busy}>
          {busy ? "Sending…" : "Send reset link"}
        </button>
        <p className={styles.links}><Link href="/login">Back to sign in</Link></p>
      </form>
    </main>
  );
}
