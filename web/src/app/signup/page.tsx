"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { adoptLocalProgress } from "@/lib/progress/sync-client";
import styles from "../login/auth.module.css";

export default function SignupPage() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function signUp(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 10) {
      setError("Use at least 10 characters.");
      return;
    }
    setBusy(true);
    setError("");
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: displayName || null },
        emailRedirectTo: `${window.location.origin}/auth/confirm`,
      },
    });
    if (error) {
      setBusy(false);
      setError(error.message);
      return;
    }
    // When email confirmation is disabled, signUp returns a live session and the
    // learner is already signed in — adopt local progress and go straight in.
    // With confirmation on, session is null: show the "check your email" screen.
    if (data.session) {
      await adoptLocalProgress();
      router.push("/");
      router.refresh();
      return;
    }
    setBusy(false);
    setSent(true);
  }

  if (sent)
    return (
      <main className={styles.wrap}>
        <div className={styles.card}>
          <h1 className={styles.title}>Check your email</h1>
          <p>We sent a confirmation link to <strong>{email}</strong>. Open it to finish creating your account.</p>
          <p className={styles.links}><Link href="/login">Back to sign in</Link></p>
        </div>
      </main>
    );

  return (
    <main className={styles.wrap}>
      <form className={styles.card} onSubmit={signUp}>
        <h1 className={styles.title}>Create account</h1>
        <label className={styles.label}>
          Display name (optional)
          <input className={styles.input} type="text" value={displayName}
            onChange={(e) => setDisplayName(e.target.value)} autoComplete="nickname" />
        </label>
        <label className={styles.label}>
          Email
          <input className={styles.input} type="email" value={email} required
            onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </label>
        <label className={styles.label}>
          Password (min 10 characters)
          <input className={styles.input} type="password" value={password} required minLength={10}
            onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
        </label>
        {error && <p className={styles.error}>{error}</p>}
        <button className={styles.primary} type="submit" disabled={busy}>
          {busy ? "Creating…" : "Create account"}
        </button>
        <p className={styles.links}><Link href="/login">Already have an account?</Link></p>
      </form>
    </main>
  );
}
