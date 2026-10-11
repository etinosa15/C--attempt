-- Phase 5 — tighten leaderboard RLS to self-read only.
--
-- The original 0005 policy allowed any signed-in client to read every opted-in row
-- (`using (opted_in = true or auth.uid() = user_id)`). That let the browser anon key
-- enumerate every opted-in learner's auth user_id (mapping display names → UUIDs).
--
-- The board is now served ONLY through /api/leaderboard using the service role, which
-- strips user_id from the response. So the table itself only needs self-read, and the
-- public board read is removed — UUIDs are no longer enumerable from the client.
--
-- Writes remain service-role-only (no insert/update/delete policy), unchanged.
--
-- Run in the Supabase SQL editor (or `supabase db push`) AFTER 0007. Idempotent.

drop policy if exists "leaderboard: read" on public.leaderboard_entries;
drop policy if exists "leaderboard: self read" on public.leaderboard_entries;
create policy "leaderboard: self read"
  on public.leaderboard_entries for select
  using (auth.uid() = user_id);
