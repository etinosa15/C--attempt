-- Phase 5 (hardening) — atomic AI-tutor reservation. Bug audit H3.
--
-- The route previously READ today's count, decided allow/deny, called Anthropic,
-- then bumped the count. Under concurrency that is a TOCTOU race: N parallel
-- requests all read "under the limit", all call Anthropic, then all bump — so the
-- daily cap is blown and the Anthropic bill is unbounded. These functions make
-- the check-and-increment a single atomic statement, so the limit holds no matter
-- how many requests arrive at once.
--
-- Run in the Supabase SQL editor (or `supabase db push`) AFTER 0006. Idempotent.
-- (Only needed before the hosted AI tutor is turned on.)

-- Atomically reserve one hint for the day IFF the learner is under p_limit.
-- Returns the new count on success, or NULL when already at/over the limit (or
-- the limit is non-positive — a clean kill switch). SECURITY DEFINER: the
-- service role reserves in one statement; learners have no write policy.
create or replace function public.reserve_tutor_hint(p_user uuid, p_day date, p_limit integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  new_count integer;
begin
  insert into public.tutor_usage (user_id, day, count)
    select p_user, p_day, 1 where p_limit >= 1
    on conflict (user_id, day)
    do update set count = public.tutor_usage.count + 1, updated_at = now()
      where public.tutor_usage.count < p_limit
    returning count into new_count;
  -- NULL means the insert was skipped (limit < 1) or the conflict-update guard
  -- failed (already at the cap): signal "denied" to the caller.
  return new_count;
end;
$$;

-- Give a reserved hint back when the upstream call ultimately failed, so a failed
-- or unavailable hint never costs the learner budget (floored at 0).
create or replace function public.release_tutor_hint(p_user uuid, p_day date)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.tutor_usage
    set count = greatest(0, count - 1), updated_at = now()
    where user_id = p_user and day = p_day;
end;
$$;
