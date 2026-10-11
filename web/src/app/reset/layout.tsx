import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Reset password · Forge Code Academy",
  description: "Request a password reset link for your Forge Code Academy account.",
};

export default function ResetLayout({ children }: { children: React.ReactNode }) {
  return children;
}
