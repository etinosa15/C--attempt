"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { normalizeEmail } from "@/lib/auth-helpers";
import { friendlyAuthError } from "@/lib/auth-errors";
import { useQueryParam } from "@/lib/useQueryParam";
import { BrandMark } from "@/components/Icon";
import { Spinner } from "@/components/loaders/Spinner";
import styles from "../login/auth.module.css";
import { glassBlur } from "@/lib/glass";

const RESEND_SECONDS = 60;

export default function ResetPage() {
  const supabase = createClient();
  const prefill = useQueryParam("email");
  const [typed, setTyped] = useState<string | null>(null);
  const email = typed ?? prefill ?? "";
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(0);

  // Resend cooldown: tick down once a second while it's running.
  useEffect(() => {
    if (wait <= 0) return;
    const id = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(id);
  }, [wait]);

  async function send() {
    setBusy(true);
    setError("");
    const { error } = await supabase.auth.resetPasswordForEmail(normalizeEmail(email), {
      redirectTo: `${window.location.origin}/auth/confirm?next=/update-password`,
    });
    setBusy(false);
    // Only connection/rate-limit problems are surfaced. Whether the address has an
    // account is never revealed: the confirmation reads the same either way.
    if (error && /fetch|network|rate|too many/i.test(error.message)) {
      setError(friendlyAuthError(error.message));
      return;
    }
    setSent(true);
    setWait(RESEND_SECONDS);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    void send();
  }

  if (sent)
    return (
      <main className={styles.wrap}>
        <div className={styles.card} style={glassBlur}>
          <Link href="/" className={styles.brand} aria-label="Forge Code Academy home">
            <BrandMark size={24} /> Forge Code Academy
          </Link>
          <h1 className={styles.title}>Check your email</h1>
          <p className={styles.body}>
            If an account exists for <strong>{normalizeEmail(email)}</strong>, a reset link is
            on its way. Check your spam folder too.
          </p>
          <div aria-live="polite">
            {error && <p className={styles.error} role="alert">{error}</p>}
          </div>
          <button
            type="button"
            className={styles.primary}
            onClick={() => void send()}
            disabled={busy || wait > 0}
          >
            {busy ? (
              <>
                <Spinner /> Sending…
              </>
            ) : wait > 0 ? (
              `Resend in ${wait}s`
            ) : (
              "Resend link"
            )}
          </button>
          <p className={styles.links}>
            <Link href="/login">Back to sign in</Link>
          </p>
        </div>
      </main>
    );

  return (
    <main className={styles.wrap}>
      <form className={styles.card} style={glassBlur} onSubmit={onSubmit}>
        <Link href="/" className={styles.brand} aria-label="Forge Code Academy home">
          <BrandMark size={24} /> Forge Code Academy
        </Link>
        <h1 className={styles.title}>Reset password</h1>
        <p className={styles.body}>Enter your email and we&apos;ll send you a link to set a new password.</p>
        <label className={styles.label}>
          Email
          <input
            className={styles.input}
            type="email"
            value={email}
            required
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="username"
            inputMode="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
        </label>
        <div aria-live="polite">
          {error && <p className={styles.error} role="alert">{error}</p>}
        </div>
        <button className={styles.primary} type="submit" disabled={busy}>
          {busy ? (
            <>
              <Spinner /> Sending…
            </>
          ) : (
            "Send reset link"
          )}
        </button>
        <p className={styles.links}>
          <Link href="/login">Back to sign in</Link>
        </p>
      </form>
    </main>
  );
}
