-- Phase 0 — durable accounts + progress.
--
-- Two tables only (subscriptions/entitlements/referrals come in later phases):
--   * profiles  — one row per learner, mirrors the auth.users identity.
--   * progress  — one JSONB row per learner, the same `state` shape core.js emits,
--                 plus a `revision` counter that drives the existing multi-device
--                 merge/conflict logic (bumped by a trigger on every write).
--
-- Row-Level Security is ON for both tables: a learner can read/write ONLY their
-- own row. Device-local prefs (theme, buddy, running focus timer) NEVER land here
-- — they stay in localStorage on the client, exactly as before.
--
-- Run this in the Supabase SQL editor (or `supabase db push`) against your project.

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  email        text,
  display_name text,
  created_at   timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles: self read"   on public.profiles;
drop policy if exists "profiles: self insert" on public.profiles;
drop policy if exists "profiles: self update" on public.profiles;

create policy "profiles: self read"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles: self insert"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "profiles: self update"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- ---------------------------------------------------------------------------
-- progress  (one row per user; `state` is the JSON core.js already produces)
-- ---------------------------------------------------------------------------
create table if not exists public.progress (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  state      jsonb       not null default '{}'::jsonb,
  revision   integer     not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.progress enable row level security;

drop policy if exists "progress: self read"   on public.progress;
drop policy if exists "progress: self insert" on public.progress;
drop policy if exists "progress: self update" on public.progress;
drop policy if exists "progress: self delete" on public.progress;

create policy "progress: self read"
  on public.progress for select
  using (auth.uid() = user_id);

create policy "progress: self insert"
  on public.progress for insert
  with check (auth.uid() = user_id);

create policy "progress: self update"
  on public.progress for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "progress: self delete"
  on public.progress for delete
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- revision + updated_at: the merge logic is revision-based, so every write must
-- bump the counter. A trigger guarantees this even if a caller forgets, and is
-- the DB-side equivalent of the file store's per-write revision increment.
-- ---------------------------------------------------------------------------
create or replace function public.bump_progress_revision()
returns trigger
language plpgsql
as $$
begin
  new.revision   := coalesce(old.revision, 0) + 1;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists progress_bump_revision on public.progress;
create trigger progress_bump_revision
  before update on public.progress
  for each row execute function public.bump_progress_revision();

-- ---------------------------------------------------------------------------
-- On signup, create the learner's profile + an empty progress row so the first
-- sync is a plain update. SECURITY DEFINER so it runs above RLS during the
-- auth.users insert (there is no session yet at that moment).
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
    values (new.id, new.email, new.raw_user_meta_data ->> 'display_name')
    on conflict (id) do nothing;
  insert into public.progress (user_id, state, revision)
    values (new.id, '{}'::jsonb, 0)
    on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
