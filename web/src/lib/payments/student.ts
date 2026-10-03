// Student verification (PURE). Turns the stored student_verifications row into
// "is this learner a currently-verified student", and decides which single
// checkout discount applies — enforcing the plan's guardrail that discounts never
// stack (student > launch deal > none). No I/O and no provider SDK: who verifies
// students (SheerID, GitHub Student Pack, …) and how big the discount is are
// config/business terms, same stance as the launch deal. This module just reads
// state and applies precedence, so the account panel and the checkout route agree
// on exactly what "a verified student" and "the discount to apply" mean.

/** The slice of a student_verifications row we resolve against. */
export type StudentRow = {
  status: string;
  expires_at: string | null;
  verified_at?: string | null;
  provider?: string | null;
};

/** The resolved student status the UI and checkout read. */
export type StudentStatus = {
  /** True iff verified and not past expiry. */
  verified: boolean;
  /** When the status lapses (ISO), or null when none / not verified. */
  expiresAt: string | null;
};

/**
 * Resolve a student row into effective status. A `null` row (never applied)
 * resolves to not-verified. Only status 'verified' with a future (or absent)
 * expiry counts — an expired or rejected row is not an active student.
 */
export function resolveStudentStatus(
  row: StudentRow | null | undefined,
  now: Date = new Date(),
): StudentStatus {
  if (!row || row.status !== "verified") return { verified: false, expiresAt: null };
  if (row.expires_at) {
    const ends = Date.parse(row.expires_at);
    if (Number.isFinite(ends) && ends <= now.getTime()) {
      return { verified: false, expiresAt: row.expires_at }; // lapsed
    }
  }
  return { verified: true, expiresAt: row.expires_at ?? null };
}

/**
 * Choose the single checkout discount to apply, newest-value-to-learner first and
 * never stacked (plan guardrail: student + launch = negative margin). A verified
 * student's discount always wins over the time-boxed launch deal; absent both,
 * null. Pass already-resolved ids (or null): the student id only when the learner
 * is verified AND it's configured; the founding id only when the deal is live.
 */
export function pickCheckoutDiscount(opts: {
  studentDiscountId?: string | null;
  foundingDiscountId?: string | null;
}): string | null {
  return opts.studentDiscountId || opts.foundingDiscountId || null;
}
