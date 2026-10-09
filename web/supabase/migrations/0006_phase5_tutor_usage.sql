-- Phase 5 — AI-tutor per-user metering.
--
-- One row per (learner, UTC day) counting hosted-tutor hints used, so the tutor
-- can be "metered per-user by entitlement" (the plan): a Pro learner gets a bounded
-- number of hints/day, keeping the Anthropic bill predictable and covered by the
-- subscription. The daily limit itself is config (env, resolved in the route) —
-- this table only records usage.
--
-- RLS: self-read (so a learner can see their own remaining budget); NO write policy
-- — the count is bumped only by the service role via bump_tutor_usage(), so a
-- learner can't reset or under-report their usage from the client.
--
-- Run in the Supabase SQL editor (or `supabase db push`) AFTER 0005. Idempotent.

create table if not exists public.tutor_usage (
  user_id    uuid        not null references auth.users (id) on delete cascade,
  -- UTC day bucket ("YYYY-MM-DD"); usage resets at the UTC-day boundary.
  day        date        not null,
  count      integer     not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);

alter table public.tutor_usage enable row level security;

-- Self-read only. No write policy: writes go through bump_tutor_usage (service role).
drop policy if exists "tutor_usage: self read" on public.tutor_usage;
create policy "tutor_usage: self read"
  on public.tutor_usage for select
  using (auth.uid() = user_id);

-- Atomically record one used hint and return the new count for the day. SECURITY
-- DEFINER so the service-role caller bumps it in one statement (no read-modify-write
-- race). Called only after a hint is successfully served, so a failed/offline hint
-- never costs the learner budget.
create or replace function public.bump_tutor_usage(p_user uuid, p_day date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  new_count integer;
begin
  insert into public.tutor_usage (user_id, day, count)
    values (p_user, p_day, 1)
    on conflict (user_id, day)
    do update set count = public.tutor_usage.count + 1, updated_at = now()
    returning count into new_count;
  return new_count;
end;
$$;
