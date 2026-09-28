import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { projects } from "@/lib/curriculum";
import { ProjectView } from "./ProjectView";

// Every project id is known at build time, so each brief is statically generated.
// The interactive milestone/rubric checkboxes and notes hydrate on top.
export function generateStaticParams() {
  return projects.map((project) => ({ id: project.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const project = projects.find((p) => p.id === id);
  if (!project) return { title: "Project not found — Forge Code Academy" };
  const track = project.lang === "js" ? "JavaScript" : "C#";
  return {
    title: `${project.title} — ${track} project — Forge Code Academy`,
    description: project.summary,
  };
}

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = projects.find((p) => p.id === id);
  if (!project) notFound();
  return <ProjectView project={project} />;
}
