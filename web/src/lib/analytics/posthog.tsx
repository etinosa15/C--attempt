"use client";

import { useEffect } from "react";
import posthog from "posthog-js";

// PostHog is wired from day one so activation/retention are measured as features
// land. It initialises only when a key is configured, so local dev without a key is
// a silent no-op. No PII beyond what Supabase auth already holds is sent here.
export function AnalyticsProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    if (!key || typeof window === "undefined") return;
    posthog.init(key, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com",
      capture_pageview: true,
      person_profiles: "identified_only",
    });
  }, []);

  return <>{children}</>;
}
