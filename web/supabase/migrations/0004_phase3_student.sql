-- Phase 3 — student verification.
--
-- A learner proves student status through an external provider (SheerID, GitHub
-- Student Pack, …) and gets a time-boxed student discount. This table is the
-- durable record of that status; the resolver (lib/payments/student.ts) turns a
-- row into "is this a currently-verified student". Status is server-authoritative:
-- a learner can read their own row but never write it — a verified status is
-- granted only by the service role (the provider bridge → /api/webhooks/student,
-- or manual admin), so a learner can't self-grant a discount by editing JS.
--
-- Which provider does the verifying, and how big the discount is, are NOT decided
-- here — they're config/business terms (STUDENT_VERIFY_URL, STUDENT_DISCOUNT_ID),
-- same stance as the launch deal. Status is time-boxed (expires_at) so students
-- re-verify periodically rather than holding the discount forever.
--
-- Run in the Supabase SQL editor (or `supabase db push`) AFTER 0003. Idempotent.

create table if not exists public.student_verifications (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  -- 'pending' | 'verified' | 'rejected' | 'expired'. The resolver only treats
  -- 'verified' (and not past expires_at) as an active student.
  status      text        not null default 'pending',
  -- Which provider verified them ('sheerid' | 'github' | 'manual' | ...).
  provider    text,
  verified_at timestamptz,
  -- When the verified status lapses (students re-verify). Null = no expiry.
  expires_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.student_verifications enable row level security;

-- Self-read only. No write policy: grants go through the service role.
drop policy if exists "student_verifications: self read" on public.student_verifications;
create policy "student_verifications: self read"
  on public.student_verifications for select
  using (auth.uid() = user_id);

-- Keep updated_at honest (mirrors the other tables).
create or replace function public.touch_student_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists student_verifications_touch_updated_at on public.student_verifications;
create trigger student_verifications_touch_updated_at
  before update on public.student_verifications
  for each row execute function public.touch_student_updated_at();
