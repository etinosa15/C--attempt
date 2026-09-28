import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { lessons, lessonsById } from "@/lib/curriculum";
import { LessonView } from "./LessonView";

// Every lesson id is known at build time, so the shell is statically generated —
// fast first paint and real content for crawlers. The interactive editor/runner
// hydrate on top of it.
export function generateStaticParams() {
  return lessons.map((lesson) => ({ id: lesson.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const lesson = lessonsById.get(id);
  if (!lesson) return { title: "Lesson not found — Forge Code Academy" };
  const track = lesson.lang === "js" ? "JavaScript" : "C#";
  return {
    title: `${lesson.title} — ${track} — Forge Code Academy`,
    description: lesson.lead,
  };
}

export default async function LessonPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const lesson = lessonsById.get(id);
  if (!lesson) notFound();
  return <LessonView lesson={lesson} />;
}
