-- Phase 3 — referrals.
--
-- Two tables:
--   referral_codes  — one shareable code per learner (lazily minted on first view
--                     of the account page). The code is what a friend pastes; the
--                     link is just `${origin}/signup?ref=<code>`.
--   referrals       — one row per *attributed* signup: which code brought which
--                     new user in, and where that referral is in its lifecycle.
--                     Unique on the referred user so a learner can be attributed
--                     once, ever (a second, later ?ref= can't re-attribute them).
--
-- Rewards (how much credit/reward a referral is worth, and whether it's credit or
-- a discount) are NOT decided here — that's a business term resolved from config
-- when the reward is actually granted. This table only records the fact and the
-- state of an attribution, so the ledger can be built on top without a schema
-- change. Keeping money terms out of the schema matches how the launch deal was
-- built (env config, not code).
--
-- RLS: a learner may READ their own code and their own referral rows (to see "you
-- referred N friends"), and may NOT write either. Creating a code and recording
-- an attribution both happen server-side via the service role (the attribution is
-- stamped at signup, before any session that could write it exists). No write
-- policy is granted on purpose.
--
-- Run in the Supabase SQL editor (or `supabase db push`) AFTER 0002. Idempotent.

-- ---------------------------------------------------------------------------
-- referral_codes
-- ---------------------------------------------------------------------------
create table if not exists public.referral_codes (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  -- Uppercase, URL-safe, unambiguous alphabet (no 0/O/1/I/L) so it survives being
  -- read aloud or retyped. Unique across all learners.
  code       text        not null unique,
  created_at timestamptz not null default now()
);

create index if not exists referral_codes_code_idx on public.referral_codes (code);

alter table public.referral_codes enable row level security;

drop policy if exists "referral_codes: self read" on public.referral_codes;
create policy "referral_codes: self read"
  on public.referral_codes for select
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- referrals — one row per attributed signup
-- ---------------------------------------------------------------------------
create table if not exists public.referrals (
  id            uuid primary key default gen_random_uuid(),
  -- The learner who shared the code.
  referrer_id   uuid        not null references auth.users (id) on delete cascade,
  -- The new learner who arrived through it. Unique: attributed at most once.
  referred_id   uuid        not null unique references auth.users (id) on delete cascade,
  code          text        not null,
  -- Lifecycle: 'signed_up' the moment we attribute, advanced by later server work
  -- (e.g. when the referred learner first goes Pro, or once a reward is granted).
  status        text        not null default 'signed_up',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists referrals_referrer_idx on public.referrals (referrer_id);

alter table public.referrals enable row level security;

-- A learner sees referrals they made (as referrer) or received (as referred).
drop policy if exists "referrals: involved read" on public.referrals;
create policy "referrals: involved read"
  on public.referrals for select
  using (auth.uid() = referrer_id or auth.uid() = referred_id);

-- Keep updated_at honest on every write (mirrors the other tables).
create or replace function public.touch_referral_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists referrals_touch_updated_at on public.referrals;
create trigger referrals_touch_updated_at
  before update on public.referrals
  for each row execute function public.touch_referral_updated_at();

-- ---------------------------------------------------------------------------
-- Attribute at signup, inside handle_new_user.
--
-- The signup form passes the friend's code in raw_user_meta_data.ref_code. Doing
-- the attribution here (SECURITY DEFINER, same transaction as the account insert)
-- makes it atomic and independent of email confirmation: whether or not the
-- learner gets a session right away, the referral is recorded exactly once, and it
-- can never be re-attributed later. Re-declared in full (create or replace) to
-- stay a single source of truth for the signup seed; adds only the referral block
-- on top of 0002's version.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ref_code   text;
  referrer   uuid;
begin
  insert into public.profiles (id, email, display_name)
    values (new.id, new.email, new.raw_user_meta_data ->> 'display_name')
    on conflict (id) do nothing;
  insert into public.progress (user_id, state, revision)
    values (new.id, '{}'::jsonb, 0)
    on conflict (user_id) do nothing;
  insert into public.subscriptions (user_id, plan, status, trial_ends_at)
    values (new.id, 'trial', 'trialing', now() + interval '7 days')
    on conflict (user_id) do nothing;

  -- Referral attribution (best-effort): only when a valid-looking code was passed,
  -- it resolves to a real code, and it isn't the learner's own (self-referral).
  ref_code := upper(trim(coalesce(new.raw_user_meta_data ->> 'ref_code', '')));
  if ref_code <> '' then
    select user_id into referrer from public.referral_codes where code = ref_code;
    if referrer is not null and referrer <> new.id then
      insert into public.referrals (referrer_id, referred_id, code, status)
        values (referrer, new.id, ref_code, 'signed_up')
        on conflict (referred_id) do nothing;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

