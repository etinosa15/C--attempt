// Turn Supabase's terse auth errors into guidance that names the actual problem and
// the next step — the login/signup UX gap where "Invalid login credentials" left the
// learner guessing whether it was the email, the password, an unconfirmed account, or
// an OAuth-only account. Pure string → string so it's trivially testable.
export function friendlyAuthError(raw: string | null | undefined): string {
  const m = (raw ?? "").toLowerCase();
  if (!m) return "Something went wrong. Please try again.";

  if (m.includes("invalid login credentials") || m.includes("invalid credentials"))
    return "That email and password don't match. Check both for a typo — and if you created this account with Google or GitHub, use those buttons instead of a password.";
  if (m.includes("not confirmed") || m.includes("email not confirmed"))
    return "Your email isn't confirmed yet. Open the confirmation link we emailed you, then sign in.";
  if (m.includes("already registered") || m.includes("already been registered") || m.includes("user already exists"))
    return "An account with this email already exists. Try signing in instead.";
  if (m.includes("rate limit") || m.includes("too many"))
    return "Too many attempts in a row. Wait a minute, then try again.";
  if (m.includes("invalid email") || (m.includes("email") && m.includes("invalid")))
    return "That email address doesn't look right — check for a typo.";
  if (m.includes("password") && (m.includes("should be") || m.includes("at least") || m.includes("weak")))
    return "That password doesn't meet the minimum — use at least 10 characters.";
  if (m.includes("failed to fetch") || m.includes("network") || m.includes("load failed"))
    return "Couldn't reach the server. Check your connection and try again.";

  // Fall back to the provider's own text (sentence-cased) rather than a blank.
  return (raw ?? "").trim() || "Something went wrong. Please try again.";
}
