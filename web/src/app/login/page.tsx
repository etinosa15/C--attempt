"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { adoptLocalProgress } from "@/lib/progress/sync-client";
import { friendlyAuthError } from "@/lib/auth-errors";
import { PasswordField } from "./PasswordField";
import styles from "./auth.module.css";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(friendlyAuthError(error.message));
      setBusy(false);
      return;
    }
    // First contact on this device: merge local progress up before syncing.
    await adoptLocalProgress();
    router.push("/");
    router.refresh();
  }

  async function oauth(provider: "github" | "google") {
    setError("");
    const redirectTo = `${window.location.origin}/auth/callback`;
    const { error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo } });
    if (error) setError(friendlyAuthError(error.message));
  }

  return (
    <main className={styles.wrap}>
      <form className={styles.card} onSubmit={signIn}>
        <h1 className={styles.title}>Sign in</h1>
        <label className={styles.label}>
          Email
          <input className={styles.input} type="email" value={email} required
            onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </label>
        <PasswordField
          label="Password"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
        />
        {error && <p className={styles.error} role="alert">{error}</p>}
        <button className={styles.primary} type="submit" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
        <div className={styles.divider}>or continue with</div>
        <div className={styles.oauth}>
          <button type="button" className={styles.oauthBtn} onClick={() => oauth("github")}>GitHub</button>
          <button type="button" className={styles.oauthBtn} onClick={() => oauth("google")}>Google</button>
        </div>
        <p className={styles.links}>
          <Link href="/reset">Forgot password?</Link>
          <Link href="/signup">Create account</Link>
        </p>
      </form>
    </main>
  );
}
