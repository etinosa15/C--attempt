import type { Metadata } from "next";
import { Projects } from "./Projects";

export const metadata: Metadata = {
  title: "Projects — Forge Code Academy",
  description:
    "Six build-it-yourself project briefs in JavaScript and C#. Real requirements, milestones, and a self-assessment rubric.",
};

// The project index. All state lives in the shared ProgressProvider, so this
// route is a thin shell around the client component — no server data.
export default function ProjectsPage() {
  return <Projects />;
}
