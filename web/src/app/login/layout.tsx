import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign in · Forge Code Academy",
  description: "Sign in to Forge Code Academy to sync your JavaScript and C# progress across devices.",
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
