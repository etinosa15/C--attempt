import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Service-role client — bypasses RLS. NEVER import this into a client component.
// The service role key is server-only (no NEXT_PUBLIC_ prefix) and must never be
// sent to the browser. Used only for privileged operations that RLS cannot express,
// e.g. deleting a learner's auth identity during account erasure.
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  return createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
