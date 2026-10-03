// Referral core (PURE). Everything the referral program needs that has no I/O:
// minting an unambiguous code, validating/normalizing one a friend typed, building
// the share link, and shaping the stats the account panel shows. The money side —
// what a referral is *worth* — is deliberately absent: rewards are a business term
// granted server-side from config, not computed here. This module is the seam both
// the minting route and the attribution path share, so "a valid code" means exactly
// one thing everywhere.

/** Unambiguous alphabet: no 0/O, 1/I/L — safe to read aloud and retype. */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 8;

/** The share link a learner sends: `/signup?ref=<code>`. */
export function referralLink(code: string, origin: string): string {
  const base = origin.replace(/\/+$/, "");
  return `${base}/signup?ref=${encodeURIComponent(code)}`;
}

/**
 * Normalize a code a friend pasted or typed: trim, uppercase, and drop anything
 * that isn't in the alphabet (spaces, dashes, stray punctuation). Returns "" when
 * nothing usable remains, so callers can treat that as "no referral".
 */
export function normalizeCode(raw: string | null | undefined): string {
  if (!raw) return "";
  let out = "";
  for (const ch of raw.toUpperCase()) {
    if (ALPHABET.includes(ch)) out += ch;
  }
  return out;
}

/** True when `code` is a well-formed code (already normalized, right length). */
export function isValidCode(code: string): boolean {
  if (code.length !== CODE_LENGTH) return false;
  for (const ch of code) {
    if (!ALPHABET.includes(ch)) return false;
  }
  return true;
}

/**
 * Mint a random code. `random` is injected (defaults to Math.random) so tests are
 * deterministic; production passes the default. Retries are the caller's job (the
 * unique index is the real guard against the astronomically unlikely collision).
 */
export function generateCode(random: () => number = Math.random): string {
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    out += ALPHABET[Math.floor(random() * ALPHABET.length)];
  }
  return out;
}

/** A referral row as the account panel reads it. */
export type ReferralRow = {
  referred_id: string;
  status: string;
};

/** What the account panel shows about a learner's referrals. */
export type ReferralStats = {
  /** How many friends signed up through the learner's code. */
  invited: number;
  /** How many of those have converted (gone Pro) — the rewarding ones. */
  converted: number;
};

/**
 * Summarize a learner's referral rows for display. `invited` counts every
 * attributed signup; `converted` counts those that have advanced past signup
 * (status "converted" or beyond). Pure so the panel and any future email/receipt
 * read the same numbers.
 */
export function referralStats(rows: ReferralRow[]): ReferralStats {
  const invited = rows.length;
  const converted = rows.filter((r) => r.status !== "signed_up").length;
  return { invited, converted };
}
