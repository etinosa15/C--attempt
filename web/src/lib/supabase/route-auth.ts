import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createClient as createCookieClient } from "./server";

// Resolve the signed-in learner for an adapter route, accepting EITHER a session
// cookie (same-origin) OR an `Authorization: Bearer <access_token>` header. The
// studio uses the bearer path because cross-site cookies do not reliably reach this
// origin; it stores the token from the login/signup reply in memory only.
//
// For the bearer path we build a client whose global Authorization header is that
// token, so the subsequent .from("progress") queries run under the learner's RLS
// identity, and validate the token with getUser(token). No cookies are read or
// written on that path.
export async function resolveUser(
  request: Request,
): Promise<{ supabase: SupabaseClient; user: User | null }> {
  const authHeader = request.headers.get("authorization") || "";
  const bearer = /^bearer\s+/i.test(authHeader) ? authHeader.replace(/^bearer\s+/i, "").trim() : "";

  if (bearer) {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: { getAll: () => [], setAll: () => {} },
        global: { headers: { Authorization: `Bearer ${bearer}` } },
      },
    );
    const { data } = await supabase.auth.getUser(bearer);
    return { supabase, user: data.user ?? null };
  }

  const supabase = await createCookieClient();
  const { data } = await supabase.auth.getUser();
  return { supabase, user: data.user ?? null };
}
