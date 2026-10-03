// Referral server access. Code minting and attribution both need the service-role
// client (RLS grants read-only to learners; these rows are server-authoritative),
// so they live here next to the other privileged writes rather than in a route.

import type { SupabaseClient } from "@supabase/supabase-js";
import { generateCode, isValidCode } from "./core";

/**
 * Return the learner's referral code, minting one on first call. Idempotent: a
 * learner has exactly one code (primary key on user_id), so a concurrent second
 * call just returns the existing one. Retries the (astronomically unlikely) unique
 * collision on the code index a few times before giving up.
 */
export async function getOrCreateReferralCode(
  admin: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const existing = await admin
    .from("referral_codes")
    .select("code")
    .eq("user_id", userId)
    .maybeSingle();
  if (existing.data?.code) return existing.data.code as string;

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCode();
    const { error } = await admin.from("referral_codes").insert({ user_id: userId, code });
    if (!error) return code;
    // 23505 = unique violation. Either the code collided (retry) or another
    // request just minted this user's row (read it back and return).
    if (error.code !== "23505") return null;
    const again = await admin
      .from("referral_codes")
      .select("code")
      .eq("user_id", userId)
      .maybeSingle();
    if (again.data?.code) return again.data.code as string;
  }
  return null;
}

/**
 * Attribute a new signup to the code that brought them in. Records a referrals row
 * (unique on referred_id, so first attribution wins and a later ?ref= can't
 * overwrite it). Self-referral is rejected. Best-effort and silent: a bad code, a
 * self-referral, or a duplicate is a no-op — attribution must never block signup.
 */
export async function attributeReferral(
  admin: SupabaseClient,
  code: string,
  referredId: string,
): Promise<boolean> {
  if (!isValidCode(code)) return false;

  const { data: owner } = await admin
    .from("referral_codes")
    .select("user_id")
    .eq("code", code)
    .maybeSingle();
  const referrerId = owner?.user_id as string | undefined;
  if (!referrerId || referrerId === referredId) return false; // unknown code or self-referral

  const { error } = await admin
    .from("referrals")
    .insert({ referrer_id: referrerId, referred_id: referredId, code, status: "signed_up" });
  // 23505 = this learner was already attributed; that's fine, not an error.
  return !error;
}
