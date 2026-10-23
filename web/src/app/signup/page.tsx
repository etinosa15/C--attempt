"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { adoptLocalProgress } from "@/lib/progress/sync-client";
import { normalizeCode, isValidCode } from "@/lib/referrals/core";
import { friendlyAuthError } from "@/lib/auth-errors";
import { normalizeEmail, suggestEmail, cleanDisplayName } from "@/lib/auth-helpers";
import { useQueryParam } from "@/lib/useQueryParam";
import { PasswordField } from "../login/PasswordField";
import { BrandMark, Icon } from "@/components/Icon";
import { Spinner } from "@/components/loaders/Spinner";
import { faCheck } from "@fortawesome/free-solid-svg-icons";
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

  // Capture ?ref=<code> from a friend's share link. Read on the client (not via
  // useSearchParams) so the page stays static; it rides along in signUp's
  // metadata and the DB trigger records the attribution atomically at signup.
  const rawRef = normalizeCode(useQueryParam("ref"));
  const refCode = isValidCode(rawRef) ? rawRef : "";

  async function signUp(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 10) {
      setError("Use at least 10 characters.");
      return;
    }
    setBusy(true);
    setError("");
    const { data, error } = await supabase.auth.signUp({
      email: normalizeEmail(email),
      password,
      options: {
        data: { display_name: cleanDisplayName(displayName).trim() || null, ref_code: refCode || null },
        emailRedirectTo: `${window.location.origin}/auth/confirm`,
      },
    });
    if (error) {
      setBusy(false);
      setError(friendlyAuthError(error.message));
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

  async function oauth(provider: "github" | "google") {
    setError("");
    const redirectTo = `${window.location.origin}/auth/callback`;
    const { error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo } });
    if (error) setError(friendlyAuthError(error.message));
  }

  if (sent)
    return (
      <main className={styles.wrap}>
        <div className={styles.card}>
          <Link href="/" className={styles.brand} aria-label="Forge Code Academy home">
            <BrandMark size={24} /> Forge Code Academy
          </Link>
          <h1 className={styles.title}>Check your email</h1>
          <p className={styles.body}>
            We sent a confirmation link to <strong>{normalizeEmail(email)}</strong>. Open it to
            finish creating your account. If it isn&apos;t there in a minute, check your spam folder.
          </p>
          <p className={styles.links}><Link href="/login">Back to sign in</Link></p>
        </div>
      </main>
    );

  const typoFix = suggestEmail(email);

  return (
    <main className={styles.wrap}>
      <form className={styles.card} onSubmit={signUp}>
        <Link href="/" className={styles.brand} aria-label="Forge Code Academy home">
          <BrandMark size={24} /> Forge Code Academy
        </Link>
        <h1 className={styles.title}>Create account</h1>
        <label className={styles.label}>
          Display name (optional)
          <input className={styles.input} type="text" value={displayName} maxLength={40}
            onChange={(e) => setDisplayName(cleanDisplayName(e.target.value))} autoComplete="nickname" />
        </label>
        <label className={styles.label}>
          Email
          <input
            className={styles.input}
            type="email"
            value={email}
            required
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            inputMode="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
          {typoFix && (
            <p className={styles.suggest} aria-live="polite">
              Did you mean{" "}
              <button type="button" className={styles.suggestBtn} onClick={() => setEmail(typoFix)}>
                {typoFix}
              </button>
              ?
            </p>
          )}
        </label>
        <PasswordField
          label="Password"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          minLength={10}
          hint={
            password.length === 0 ? (
              <p className={styles.hint}>At least 10 characters.</p>
            ) : password.length < 10 ? (
              <p className={styles.hint} aria-live="polite">
                {10 - password.length} more character{10 - password.length === 1 ? "" : "s"} to go
              </p>
            ) : (
              <p className={`${styles.hint} ${styles.hintOk}`} aria-live="polite">
                <Icon icon={faCheck} /> Long enough
              </p>
            )
          }
        />
        {error && <p className={styles.error} role="alert">{error}</p>}
        <button className={styles.primary} type="submit" disabled={busy}>
          {busy ? (
            <>
              <Spinner /> Creating…
            </>
          ) : (
            "Create account"
          )}
        </button>
        <p className={styles.fine}>
          By creating an account you agree to the <Link href="/terms">Terms</Link> and{" "}
          <Link href="/privacy">Privacy Policy</Link>.
        </p>
        <div className={styles.divider}>or continue with</div>
        <div className={styles.oauth}>
          <button type="button" className={styles.oauthBtn} onClick={() => oauth("github")}>GitHub</button>
          <button type="button" className={styles.oauthBtn} onClick={() => oauth("google")}>Google</button>
        </div>
        <p className={styles.links}>
          <span>Already have an account?</span>
          <Link href="/login">Sign in</Link>
        </p>
        <p className={styles.secondary}>
          <Link href="/learn">Try without an account</Link>
        </p>
      </form>
    </main>
  );
}
