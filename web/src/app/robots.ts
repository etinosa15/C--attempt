import type { MetadataRoute } from "next";

const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://forge-app-omega-dusky.vercel.app";

// SECURITY_NOTES item 24 / forge-fix 2.15: keep authenticated and private areas
// out of crawlers. Set NEXT_PUBLIC_SITE_URL to the canonical domain once chosen.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/learn", "/api", "/dev", "/checkout", "/update-password", "/auth"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
