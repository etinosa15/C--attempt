import type { Metadata } from "next";
import { Paths, type PathFilter } from "./Paths";

export const metadata: Metadata = {
  title: "Your roadmap — Forge Code Academy",
  description:
    "Forty focused lessons across JavaScript and C#, grouped by module. See what you've finished and what comes next.",
};

const FILTERS: PathFilter[] = ["all", "js", "cs", "compare"];

// The per-module lesson drill-down (the vanilla studio's #paths screen). All
// progress lives in the shared ProgressProvider, so this route is a thin shell:
// it only resolves an optional `?filter=` into the starting tab (shareable URLs),
// then hands off to the client component, which owns the tab switching locally.
export default async function PathsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { filter } = await searchParams;
  const initial: PathFilter =
    filter && (FILTERS as string[]).includes(filter) ? (filter as PathFilter) : "all";
  return <Paths initialFilter={initial} />;
}
