-- Phase 5 — opt-in leaderboard.
--
-- A public board ranked by XP among learners who CHOOSE to appear. Privacy posture
-- (see the plan): opt-in ONLY — no learner is ever on the board until they opt in,
-- and we store a learner-chosen display name, never their email. Opting out hides
-- them again.
--
-- Score integrity: `xp` is NOT learner-writable. All writes go through the service
-- role (the /api/leaderboard route), which recomputes XP from the learner's own
-- authoritative progress row — so a learner can't POST an inflated score or edit
-- `xp` directly via the anon client. RLS therefore grants SELECT only (own row
-- always; anyone else's only while opted in) and NO insert/update/delete.
--
-- Run in the Supabase SQL editor (or `supabase db push`) AFTER 0004. Idempotent.

create table if not exists public.leaderboard_entries (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  -- Learner-chosen handle shown on the board (sanitized server-side). Never email.
  display_name text        not null,
  -- Server-computed XP (from the progress row), refreshed when the learner opts in
  -- or revisits the board. Not learner-writable (no write policy; service role only).
  xp           integer     not null default 0,
  -- The board only ever shows rows with opted_in = true.
  opted_in     boolean     not null default true,
  updated_at   timestamptz not null default now()
);

-- Board reads order by this.
create index if not exists leaderboard_entries_rank_idx
  on public.leaderboard_entries (opted_in, xp desc);

alter table public.leaderboard_entries enable row level security;

-- SELECT only: your own row always (to know your opt-in state + standing), and any
-- opted-in row (the public board). No write policy — writes go through the service
-- role, so xp and opted_in can't be forged from the client.
drop policy if exists "leaderboard: read" on public.leaderboard_entries;
create policy "leaderboard: read"
  on public.leaderboard_entries for select
  using (opted_in = true or auth.uid() = user_id);

-- Keep updated_at honest on every write (mirrors the other tables).
create or replace function public.touch_leaderboard_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists leaderboard_entries_touch_updated_at on public.leaderboard_entries;
create trigger leaderboard_entries_touch_updated_at
  before update on public.leaderboard_entries
  for each row execute function public.touch_leaderboard_updated_at();
