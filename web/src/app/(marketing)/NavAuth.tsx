"use client";

// The only client island on the marketing surface. The pages render statically
// (great for SEO — crawlers see the signed-out CTA), and once hydrated this swaps
// in a personalized "Continue learning" link for a signed-in visitor. Uses the
// browser Supabase client (public anon key only) and mirrors the session with
// onAuthStateChange, the same pattern the auth screens use.
import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import styles from "./marketing.module.css";

export function NavAuth() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (active) setSignedIn(!!data.user);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setSignedIn(!!session?.user);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Signed in: one click back into the app. Otherwise (and until we know, so the
  // static markup is the signed-out funnel) show sign in + get started.
  if (signedIn) {
    return (
      <div className={styles.navAuth}>
        <Link href="/learn" className={`${styles.btnPrimary} ${styles.btnSmall}`}>
          Continue learning
        </Link>
      </div>
    );
  }

  return (
    <div className={styles.navAuth}>
      <Link href="/login" className={styles.signIn}>
        Sign in
      </Link>
      <Link href="/signup" className={`${styles.btnPrimary} ${styles.btnSmall}`}>
        Get started
      </Link>
    </div>
  );
}
