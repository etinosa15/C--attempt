import type { Metadata } from "next";
import { Notebook } from "./Notebook";

export const metadata: Metadata = {
  title: "Notebook — Forge Code Academy",
  description:
    "Every note you've written while learning, in one place — plus a scratchpad for whatever you're thinking through right now.",
};

// The learner's notes, aggregated. All content lives in the shared
// ProgressProvider, so this route is a thin shell around the client component.
export default function NotebookPage() {
  return <Notebook />;
}
