import type { Metadata } from "next";
import { Settings } from "./Settings";

export const metadata: Metadata = {
  title: "Settings — Forge Code Academy",
  description:
    "Make this space yours: appearance, a daily focus goal, portable backups of your progress, and your local runtime status.",
};

// A thin server shell. Everything on this screen reads the shared, device-local
// progress state, so the real work lives in the client component. Account actions
// deliberately stay in the top bar (one click from every screen), not here.
export default function SettingsPage() {
  return <Settings />;
}
