-- Phase 2 — subscriptions + reverse trial.
--
-- One row per learner holding the billing/entitlement state the server reads to
-- decide what a session may do. The resolver that turns this row into concrete
-- capabilities lives in web/src/lib/entitlements/policy.ts; this table is only the
-- durable source of truth it reads.
--
-- Reverse trial: every NEW signup starts on a 7-day full-Pro trial
-- (plan='trial', status='trialing', trial_ends_at = now() + 7 days), then the
-- resolver downshifts them to the capped Free floor when the trial lapses. No
-- hard lockout — they keep their account, streak and local progress.
--
-- RLS: a learner may READ their own row, but may NOT write it. Entitlements are
-- server-authoritative — only the service-role client (payment webhooks, trial
-- administration) writes here, so a learner can never grant themselves Pro by
-- editing shippable JS. The service role bypasses RLS, so no write policy is
-- needed (and none is granted on purpose).
--
-- Run this in the Supabase SQL editor (or `supabase db push`) against your
-- project, AFTER 0001. It is idempotent.

-- ---------------------------------------------------------------------------
-- subscriptions
-- ---------------------------------------------------------------------------
create table if not exists public.subscriptions (
  user_id                  uuid primary key references auth.users (id) on delete cascade,
  -- Coarse plan the learner is on: 'trial' | 'free' | 'pro'. The resolver maps
  -- this + status + the timestamps to an effective tier; this column is the
  -- stored intent, not the computed access level.
  plan                     text        not null default 'trial',
  -- Lifecycle status, aligned with the MoR/Stripe vocabulary we adopt later so a
  -- webhook can write it verbatim: 'trialing' | 'active' | 'past_due' |
  -- 'canceled' | 'expired'.
  status                   text        not null default 'trialing',
  -- When the reverse trial lapses (null once the learner is on a paid plan).
  trial_ends_at            timestamptz,
  -- End of the current paid billing period (null while trialing/free). The
  -- resolver treats a paid plan as expired once now() passes this.
  current_period_end       timestamptz,
  -- Set true by a cancel webhook: keep Pro until current_period_end, then drop.
  cancel_at_period_end     boolean     not null default false,
  -- Merchant-of-record wiring, populated only once a real subscription exists.
  -- Vendor stays undecided until the payments unit; null until then.
  provider                 text,       -- 'paddle' | 'stripe' | null
  provider_customer_id     text,
  provider_subscription_id text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

alter table public.subscriptions enable row level security;

-- Self-read ONLY. No insert/update/delete policy: writes go through the
-- service-role client, which bypasses RLS.
drop policy if exists "subscriptions: self read" on public.subscriptions;

create policy "subscriptions: self read"
  on public.subscriptions for select
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Keep updated_at honest on every write (mirrors progress.bump_progress_revision).
-- ---------------------------------------------------------------------------
create or replace function public.touch_subscription_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists subscriptions_touch_updated_at on public.subscriptions;
create trigger subscriptions_touch_updated_at
  before update on public.subscriptions
  for each row execute function public.touch_subscription_updated_at();

-- ---------------------------------------------------------------------------
-- Seed the reverse trial on signup. Extends the Phase 0 handle_new_user so a
-- subscriptions row is created alongside the profile + progress rows, in the same
-- SECURITY DEFINER context (no session exists yet at auth.users insert time).
-- Re-declared in full (create or replace) so it stays a single source of truth.
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
  insert into public.subscriptions (user_id, plan, status, trial_ends_at)
    values (new.id, 'trial', 'trialing', now() + interval '7 days')
    on conflict (user_id) do nothing;
  return new;
end;
$$;

-- Trigger itself is unchanged from 0001; re-assert it so this migration is
-- self-contained if replayed against a fresh database.
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Backfill accounts that predate this migration. They already had their
-- honeymoon, so they start on the Free floor rather than a fresh trial — a
-- conservative default (never auto-grant Pro). Tune here if you'd rather grant
-- existing learners a trial at launch.
-- ---------------------------------------------------------------------------
insert into public.subscriptions (user_id, plan, status, trial_ends_at)
  select id, 'free', 'expired', null from auth.users
  on conflict (user_id) do nothing;
