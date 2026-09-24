import type { Metadata } from "next";
import "./globals.css";
import { AnalyticsProvider } from "@/lib/analytics/posthog";

export const metadata: Metadata = {
  title: "Forge Code Academy",
  description: "Learn JavaScript and C# by building — progress that follows you across devices.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>
        <AnalyticsProvider>{children}</AnalyticsProvider>
      </body>
    </html>
  );
}
