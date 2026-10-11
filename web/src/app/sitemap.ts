import type { MetadataRoute } from "next";

const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://forge-app-omega-dusky.vercel.app";

// Public, indexable marketing pages only — authenticated /learn and private
// routes are deliberately excluded (forge-fix 2.15).
export default function sitemap(): MetadataRoute.Sitemap {
  const routes = ["", "/pricing", "/about", "/privacy", "/terms", "/refund", "/local-setup", "/login", "/signup"];
  const now = new Date();
  return routes.map((route) => ({
    url: `${base}${route}`,
    lastModified: now,
    changeFrequency: "monthly" as const,
    priority: route === "" ? 1 : 0.6,
  }));
}
