import type { NextConfig } from "next";
import path from "node:path";

const repoRoot = path.join(process.cwd(), "..");

// Content-Security-Policy (SECURITY_NOTES item 20). Origins come from env so the
// same build works on any host. Notes on the looser bits:
//  - script 'unsafe-inline': the theme boot script and Next's inline bootstrap.
//  - script 'unsafe-eval': the JS runner Web Worker runs learner code with
//    AsyncFunction, and a bundled worker inherits this header. Dev also needs it.
const isDev = process.env.NODE_ENV !== "production";
const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseWs = supabase.replace(/^http/, "ws");
const posthog = process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com";
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.paddle.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  [
    "connect-src 'self'",
    supabase,
    supabaseWs,
    posthog,
    "https://*.posthog.com",
    "https://api.pwnedpasswords.com",
    "https://*.paddle.com",
    isDev ? "ws: http://127.0.0.1:* http://localhost:*" : "",
  ]
    .filter(Boolean)
    .join(" "),
  "worker-src 'self' blob:",
  "frame-src 'self' https://*.paddle.com https://checkout.paystack.com",
  "frame-ancestors 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

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
  // Baseline security headers for the whole app (SECURITY_NOTES item 20).
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Content-Security-Policy", value: csp },
        ],
      },
    ];
  },
};

export default nextConfig;
