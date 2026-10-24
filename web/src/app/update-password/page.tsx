"use client";

import { useState } from "react";
import { pwnedCount } from "@/lib/pwned";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { friendlyAuthError } from "@/lib/auth-errors";
import { PasswordField } from "../login/PasswordField";
import { BrandMark, Icon } from "@/components/Icon";
import { Spinner } from "@/components/loaders/Spinner";
import { faCheck } from "@fortawesome/free-solid-svg-icons";
import styles from "../login/auth.module.css";
import { glassBlur } from "@/lib/glass";

// Reached from the recovery email (which established a temporary session via
// /auth/confirm). Setting a new password here completes the reset. An expired or
// already-used link has no session, so the update fails with a clear way forward.
export default function UpdatePasswordPage() {
  const supabase = createClient();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [expired, setExpired] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function update(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 10) {
      setError("Use at least 10 characters.");
      return;
    }
    setBusy(true);
    setError("");
    if ((await pwnedCount(password)) > 0) {
      setBusy(false);
      setError("This password has shown up in a known data breach. Please choose a different one.");
      return;
    }
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      setExpired(/session missing|expired|otp|token has/i.test(error.message));
      setError(friendlyAuthError(error.message));
      return;
    }
    setDone(true);
  }

  if (done)
    return (
      <main className={styles.wrap}>
        <div className={styles.card} style={glassBlur}>
          <Link href="/" className={styles.brand} aria-label="Forge Code Academy home">
            <BrandMark size={24} /> Forge Code Academy
          </Link>
          <h1 className={styles.title}>Password updated</h1>
          <p className={styles.body}>
            <Icon icon={faCheck} /> Your new password is saved and you&apos;re signed in. Use it
            next time you sign in.
          </p>
          <Link href="/learn" className={styles.primary}>
            Continue to the studio
          </Link>
        </div>
      </main>
    );

  const left = 10 - password.length;

  return (
    <main className={styles.wrap}>
      <form className={styles.card} style={glassBlur} onSubmit={update}>
        <Link href="/" className={styles.brand} aria-label="Forge Code Academy home">
          <BrandMark size={24} /> Forge Code Academy
        </Link>
        <h1 className={styles.title}>Set a new password</h1>
        <PasswordField
          label="New password"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          minLength={10}
          hint={
            password.length === 0 ? (
              <p className={styles.hint}>At least 10 characters.</p>
            ) : left > 0 ? (
              <p className={styles.hint} aria-live="polite">
                {password.length} / 10 characters
              </p>
            ) : (
              <p className={`${styles.hint} ${styles.hintOk}`} aria-live="polite">
                <Icon icon={faCheck} /> Long enough
              </p>
            )
          }
        />
        <div aria-live="polite">
          {error && <p className={styles.error} role="alert">{error}</p>}
        </div>
        {expired ? (
          <Link href="/reset" className={styles.primary}>
            Request a new link
          </Link>
        ) : (
          <button className={styles.primary} type="submit" disabled={busy}>
            {busy ? (
              <>
                <Spinner /> Saving…
              </>
            ) : (
              "Save password"
            )}
          </button>
        )}
      </form>
    </main>
  );
}
