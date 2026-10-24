// Breached-password check via Have I Been Pwned's k-anonymity range API. Only the
// first 5 hex chars of the password's SHA-1 leave the browser; the match against
// the returned suffixes happens locally. Fails open: a network error never blocks
// signup, it just skips the warning.

/** Count for `suffix` in a range response ("SUFFIX:COUNT" lines), 0 if absent. */
export function countInRange(body: string, suffix: string): number {
  const want = suffix.toUpperCase();
  for (const line of body.split(/\r?\n/)) {
    const [s, n] = line.trim().split(":");
    if (s && s.toUpperCase() === want) return Number(n) || 0;
  }
  return 0;
}

async function sha1Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
}

/** How many times this password appears in known breaches (0 = not found or check failed). */
export async function pwnedCount(password: string): Promise<number> {
  try {
    const hash = await sha1Hex(password);
    const res = await fetch(`https://api.pwnedpasswords.com/range/${hash.slice(0, 5)}`, {
      headers: { "Add-Padding": "true" },
    });
    if (!res.ok) return 0;
    return countInRange(await res.text(), hash.slice(5));
  } catch {
    return 0;
  }
}
