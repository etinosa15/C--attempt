import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Server Supabase client, bound to the request's cookies so RLS sees the signed-in
// learner. Used in route handlers and server components. Still the anon key — RLS
// enforces per-user access; see createAdminClient for the rare service-role paths.
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet)
              cookieStore.set(name, value, options);
          } catch {
            // Called from a Server Component: cookies are read-only there. The
            // middleware refreshes the session cookie, so this is safe to ignore.
          }
        },
      },
    },
  );
}
