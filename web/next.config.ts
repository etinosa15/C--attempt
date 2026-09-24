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
};

export default nextConfig;
