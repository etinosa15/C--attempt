import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Create account · Forge Code Academy",
  description: "Create a free Forge Code Academy account to save and sync your progress. No credit card required.",
};

export default function SignupLayout({ children }: { children: React.ReactNode }) {
  return children;
}
