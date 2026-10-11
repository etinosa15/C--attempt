import type { NextConfig } from "next";
import path from "node:path";

const repoRoot = path.join(process.cwd(), "..");

const nextConfig: NextConfig = {
  // The progress-merge rules live in repo-root public/core.js (the single source of
  // truth shared with the browser store and legacy sync service). externalDir lets
  // us import that file from outside the Next app dir instead of copying it.
  experimental: {
    externalDir: true,
  },
  // Include the repo root when tracing server files for deployment, so core.js is
  // bundled with the API routes that import it.
  outputFileTracingRoot: repoRoot,
  // Baseline security headers for the whole app (SECURITY_NOTES item 20). A tuned
  // Content-Security-Policy is intentionally omitted here — Next's inline bootstrap
  // plus Supabase/Paystack/PostHog origins need careful testing; add it separately.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
