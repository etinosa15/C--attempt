"use client";

// A password input with a show/hide "eye" toggle, shared by the sign-in and sign-up
// forms so a learner can see what they typed instead of guessing at masked dots.
// Behaviour only — the visual polish (focus ring size, 48px height, glass) lands in
// the Phase 4F pass. The toggle is a real <button> with an aria-label + aria-pressed
// so it's keyboard- and screen-reader-friendly; the eye icons are inline SVG (no
// icon-library dependency yet).
import { useState, type ReactNode, type Ref } from "react";
import styles from "./auth.module.css";

interface Props {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: "current-password" | "new-password";
  minLength?: number;
  /** Optional live hint rendered under the field (e.g. the password-length meter). */
  hint?: ReactNode;
  /** Lets the form move focus back here (e.g. after a failed sign-in). */
  inputRef?: Ref<HTMLInputElement>;
}

export function PasswordField({ label, value, onChange, autoComplete, minLength, hint, inputRef }: Props) {
  const [show, setShow] = useState(false);
  const [capsOn, setCapsOn] = useState(false);
  // Caps Lock state is only knowable from a keyboard event, so read it on every
  // key press inside the field and clear it when focus leaves.
  const readCaps = (e: React.KeyboardEvent<HTMLInputElement>) =>
    setCapsOn(e.getModifierState("CapsLock"));
  return (
    <label className={styles.label}>
      {label}
      <div className={styles.pwWrap}>
        <input
          ref={inputRef}
          className={`${styles.input} ${styles.pwInput}`}
          type={show ? "text" : "password"}
          value={value}
          required
          minLength={minLength}
          maxLength={128}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={readCaps}
          onKeyUp={readCaps}
          onBlur={() => setCapsOn(false)}
          autoComplete={autoComplete}
        />
        <button
          type="button"
          className={styles.pwToggle}
          onClick={() => setShow((s) => !s)}
          aria-label={show ? "Hide password" : "Show password"}
          aria-pressed={show}
        >
          {show ? <EyeOff /> : <Eye />}
        </button>
      </div>
      {capsOn && (
        <p className={styles.capsWarn} role="status">
          Caps Lock is on.
        </p>
      )}
      {hint}
    </label>
  );
}

function Eye() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOff() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9.9 4.24A9.1 9.1 0 0 1 12 4c6.5 0 10 7 10 7a13.2 13.2 0 0 1-2.16 2.95M6.3 6.3A13.2 13.2 0 0 0 2 11s3.5 7 10 7a9.1 9.1 0 0 0 4.1-.95" />
      <path d="M3 3l18 18" />
    </svg>
  );
}
