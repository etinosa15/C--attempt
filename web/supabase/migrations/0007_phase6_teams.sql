-- Phase 6 — Teams / Edu (foundation).
--
-- A team owns a subscription with a number of seats; its active members inherit Pro
-- through their seat, instead of each holding a personal subscription. This is the
-- durable model the seat-math + team-entitlement resolvers read; the per-seat
-- BILLING (buying/adjusting seats via Paddle), the INVITE flow, and the cohort
-- progress dashboard are later units — the plan gates Teams on "B2C proven", and
-- the billing half needs live Paddle. Until a team is created (service-role, by the
-- billing unit) these tables are empty and the entitlement wiring is a no-op.
--
-- RLS: a learner reads their OWN membership rows and the teams they're an active
-- member of. Writes (create team, set seats, add/remove members) go through the
-- service role, tied to the team's billing — so a learner can't grant themselves a
-- seat. Reading other members (the roster) is a server-authoritative read in the
-- /api/teams route, not a broad RLS grant, to keep progress/identity private.
--
-- Run in the Supabase SQL editor (or `supabase db push`) AFTER 0006. Idempotent.

-- ---------------------------------------------------------------------------
-- teams — one row per team, holding its seat count + billing state
-- ---------------------------------------------------------------------------
create table if not exists public.teams (
  id                       uuid primary key default gen_random_uuid(),
  name                     text        not null,
  owner_id                 uuid        not null references auth.users (id) on delete cascade,
  -- Purchased seats. Active members beyond this are "over seat" (billing reconciles).
  seats                    integer     not null default 0,
  -- Team subscription lifecycle, same vocabulary as public.subscriptions.
  status                   text        not null default 'active',
  current_period_end       timestamptz,
  cancel_at_period_end     boolean     not null default false,
  -- Merchant-of-record wiring for the team subscription (Paddle), null until billed.
  provider                 text,
  provider_customer_id     text,
  provider_subscription_id text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- team_members — membership + seat occupancy
-- ---------------------------------------------------------------------------
create table if not exists public.team_members (
  team_id    uuid        not null references public.teams (id) on delete cascade,
  user_id    uuid        not null references auth.users (id) on delete cascade,
  -- 'owner' | 'admin' | 'member'.
  role       text        not null default 'member',
  -- 'active' (occupies a seat, inherits Pro) | 'invited' | 'removed'.
  status     text        not null default 'active',
  created_at timestamptz not null default now(),
  primary key (team_id, user_id)
);

create index if not exists team_members_user_idx on public.team_members (user_id);

alter table public.teams enable row level security;
alter table public.team_members enable row level security;

-- A learner reads their own membership rows (to resolve their seat + see their team).
drop policy if exists "team_members: self read" on public.team_members;
create policy "team_members: self read"
  on public.team_members for select
  using (auth.uid() = user_id);

-- SECURITY DEFINER membership check, so the teams read policy doesn't recurse
-- through team_members' own RLS.
create or replace function public.is_active_team_member(p_team uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.team_members
    where team_id = p_team and user_id = auth.uid() and status = 'active'
  );
$$;

-- A team is readable by its owner and its active members. No write policy: team +
-- membership writes go through the service role (tied to billing).
drop policy if exists "teams: member read" on public.teams;
create policy "teams: member read"
  on public.teams for select
  using (owner_id = auth.uid() or public.is_active_team_member(id));

-- Keep updated_at honest on team writes (mirrors the other tables).
create or replace function public.touch_team_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists teams_touch_updated_at on public.teams;
create trigger teams_touch_updated_at
  before update on public.teams
  for each row execute function public.touch_team_updated_at();
