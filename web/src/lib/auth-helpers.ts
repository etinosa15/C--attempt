// Small, pure helpers for the auth screens. No DOM, no I/O, so they're unit-tested
// directly (tests/auth-helpers.test.mjs).

/** Trim and lowercase an email before it goes to the auth provider. */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/**
 * Validate a post-login return path. Only same-origin relative paths are allowed:
 * "/learn/lesson/js-values" passes; "https://evil.com", "//evil.com", "/\\evil.com"
 * and "@evil.com" (which turns `${origin}${next}` into userinfo) all fall back.
 * Prevents an open redirect through ?next= on login and the auth callbacks.
 */
export function safeNextPath(raw: string | null | undefined, fallback = "/learn"): string {
  if (!raw || typeof raw !== "string") return fallback;
  if (raw.length > 512) return fallback;
  if (!raw.startsWith("/")) return fallback;
  if (raw.startsWith("//") || raw.startsWith("/\\")) return fallback;
  // No control characters or backslashes anywhere (browsers normalize \ to /).
  if (/[\u0000-\u001f\u007f\\]/.test(raw)) return fallback;
  return raw;
}

// Common misspellings of the big consumer mail domains. Kept small and explicit:
// a false "did you mean" is worse than none.
const DOMAIN_FIXES: Record<string, string> = {
  "gmial.com": "gmail.com",
  "gmal.com": "gmail.com",
  "gmaill.com": "gmail.com",
  "gmail.co": "gmail.com",
  "gmail.con": "gmail.com",
  "gmail.cm": "gmail.com",
  "gamil.com": "gmail.com",
  "gnail.com": "gmail.com",
  "gmai.com": "gmail.com",
  "yaho.com": "yahoo.com",
  "yahooo.com": "yahoo.com",
  "yahoo.co": "yahoo.com",
  "yahoo.con": "yahoo.com",
  "yhoo.com": "yahoo.com",
  "outlok.com": "outlook.com",
  "outloo.com": "outlook.com",
  "outlook.co": "outlook.com",
  "outlook.con": "outlook.com",
  "hotmial.com": "hotmail.com",
  "hotmal.com": "hotmail.com",
  "hotmail.co": "hotmail.com",
  "hotmail.con": "hotmail.com",
  "hotmai.com": "hotmail.com",
  "iclod.com": "icloud.com",
  "icloud.co": "icloud.com",
};

/** "ada@gmial.com" → "ada@gmail.com"; null when there's nothing to suggest. */
export function suggestEmail(raw: string): string | null {
  const email = normalizeEmail(raw);
  const at = email.lastIndexOf("@");
  if (at < 1 || at === email.length - 1) return null;
  const domain = email.slice(at + 1);
  const fix = DOMAIN_FIXES[domain];
  return fix ? `${email.slice(0, at)}@${fix}` : null;
}

/** Strip control characters and cap a display name. */
export function cleanDisplayName(raw: string, max = 40): string {
  return raw.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, max);
}
