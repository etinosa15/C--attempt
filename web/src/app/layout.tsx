import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AnalyticsProvider } from "@/lib/analytics/posthog";
import { THEME_BOOT_SCRIPT } from "@/lib/theme";

export const metadata: Metadata = {
  title: "Forge Code Academy",
  description: "Learn JavaScript and C# by building — progress that follows you across devices.",
};

export const viewport: Viewport = {
  themeColor: "#b4531e",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // data-theme is set by the boot script below before first paint; the server
    // renders none, so suppress the resulting hydration attribute mismatch.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body>
        <div className="forge-aurora" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <AnalyticsProvider>{children}</AnalyticsProvider>
      </body>
    </html>
  );
}
