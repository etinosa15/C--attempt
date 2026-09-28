import { createClient } from "@/lib/supabase/server";
import { getEntitlement } from "@/lib/entitlements/server";
import { ProgressProvider } from "@/lib/progress/useProgress";
import { TopBar } from "./TopBar";
import styles from "./learn.module.css";

// The learning surface shell. A server component so the session is read once, up
// front, and handed to the client progress provider as a plain boolean — the
// browser never receives tokens, only "are you signed in". Every /learn/* screen
// renders inside one shared ProgressProvider, so progress is consistent across
// Overview, lessons, review and projects without prop-drilling or refetching.
export default async function LearnLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Resolve the entitlement server-side so the top bar renders the trial/plan
  // state with no flash and the browser receives only capability booleans (no
  // tokens). Signed-out learners have no account entitlement to surface.
  const entitlement = user ? await getEntitlement(supabase, user.id) : null;

  return (
    <ProgressProvider signedIn={!!user}>
      <div className={styles.shell}>
        <TopBar email={user?.email ?? null} entitlement={entitlement} />
        <main className={styles.content}>{children}</main>
      </div>
    </ProgressProvider>
  );
}
