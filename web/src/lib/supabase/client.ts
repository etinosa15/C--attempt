import { createBrowserClient } from "@supabase/ssr";

// Browser Supabase client. Reads the *public* anon key only — never the service
// role key, which stays server-side. Safe to import into client components.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
