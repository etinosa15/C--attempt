import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { AccountActions } from "./account-actions";
import styles from "./page.module.css";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const legacyUrl = process.env.NEXT_PUBLIC_LEGACY_APP_URL || "#";

  return (
    <main className={styles.main}>
      <section className={styles.hero}>
        <h1>Forge Code Academy</h1>
        <p className={styles.tagline}>
          Learn JavaScript and C# by building. Your progress is saved on this device and,
          when you sign in, synced across all of them.
        </p>

        {user ? (
          <div className={styles.card}>
            <p>
              Signed in as <strong>{user.email}</strong>
            </p>
            <div className={styles.row}>
              <a className={styles.primary} href={legacyUrl}>Open the studio</a>
              <a className={styles.secondary} href="/api/account/export">Export my data</a>
            </div>
            <div className={styles.row}>
              <form action="/auth/signout" method="post">
                <button className={styles.secondary} type="submit">Sign out</button>
              </form>
              <AccountActions />
            </div>
          </div>
        ) : (
          <div className={styles.card}>
            <p>Signed-out learners keep working offline — sign in to sync and never lose progress.</p>
            <div className={styles.row}>
              <a className={styles.primary} href={legacyUrl}>Open the studio</a>
              <Link className={styles.secondary} href="/login">Sign in</Link>
              <Link className={styles.secondary} href="/signup">Create account</Link>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
