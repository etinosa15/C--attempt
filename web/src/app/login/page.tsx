"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { adoptLocalProgress } from "@/lib/progress/sync-client";
import { friendlyAuthError } from "@/lib/auth-errors";
import { normalizeEmail, safeNextPath } from "@/lib/auth-helpers";
import { useQueryParam } from "@/lib/useQueryParam";
import { PasswordField } from "./PasswordField";
import { BrandMark } from "@/components/Icon";
import { Spinner } from "@/components/loaders/Spinner";
import styles from "./auth.module.css";
import { glassBlur } from "@/lib/glass";

// Messages for the ?error= codes the auth callback routes redirect back with.
const RETURN_ERRORS: Record<string, string> = {
  verify: "That email link has expired or was already used. Sign in, or request a new link below.",
  auth: "Signing in with that provider didn't finish. Please try again.",
};

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);
  const returnError = RETURN_ERRORS[useQueryParam("error") ?? ""];

  // Where to land after sign-in: the page that sent the learner here, if it's a
  // safe same-origin path; otherwise the studio.
  function nextPath(): string {
    return safeNextPath(new URLSearchParams(window.location.search).get("next"), "/learn");
  }

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { error } = await supabase.auth.signInWithPassword({
      email: normalizeEmail(email),
      password,
    });
    if (error) {
      setError(friendlyAuthError(error.message));
      setBusy(false);
      // Keep the email; send the learner straight back to the password.
      passwordRef.current?.focus();
      return;
    }
    // First contact on this device: merge local progress up before syncing.
    await adoptLocalProgress();
    router.push(nextPath());
    router.refresh();
  }

  async function oauth(provider: "github" | "google") {
    setError("");
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath())}`;
    const { error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo } });
    if (error) setError(friendlyAuthError(error.message));
  }

  return (
    <main className={styles.wrap}>
      <form className={styles.card} style={glassBlur} onSubmit={signIn}>
        <Link href="/" className={styles.brand} aria-label="Forge Code Academy home">
          <BrandMark size={24} /> Forge Code Academy
        </Link>
        <h1 className={styles.title}>Sign in</h1>
        {returnError && !error && <p className={styles.notice} role="status">{returnError}</p>}
        <label className={styles.label}>
          Email
          <input
            className={styles.input}
            type="email"
            value={email}
            required
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            inputMode="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
        </label>
        <PasswordField
          label="Password"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
          inputRef={passwordRef}
        />
        <div aria-live="polite">
          {error && <p className={styles.error} role="alert">{error}</p>}
        </div>
        <button className={styles.primary} type="submit" disabled={busy}>
          {busy ? (
            <>
              <Spinner /> Signing in…
            </>
          ) : (
            "Sign in"
          )}
        </button>
        <div className={styles.divider}>or continue with</div>
        <div className={styles.oauth}>
          <button type="button" className={styles.oauthBtn} onClick={() => oauth("github")}>GitHub</button>
          <button type="button" className={styles.oauthBtn} onClick={() => oauth("google")}>Google</button>
        </div>
        <p className={styles.links}>
          <Link href={email ? `/reset?email=${encodeURIComponent(normalizeEmail(email))}` : "/reset"}>
            Forgot password?
          </Link>
          <Link href="/signup">Create account</Link>
        </p>
        <p className={styles.secondary}>
          <Link href="/learn">Try without an account</Link>
        </p>
      </form>
    </main>
  );
}
