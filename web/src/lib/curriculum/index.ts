// Typed entry point to the curriculum. repo-root public/curriculum.js is the
// authored source (it in turn stitches together js-lessons.js + cs-lessons.js and
// defines modules/tracks/bridges/projects). We import that exact module via the
// `externalDir` option in next.config.ts and re-export it under the contracts in
// ./types, so the React surface reads `lessons`, `tracks`, etc. fully typed while
// the data itself is never duplicated. Import curriculum from HERE, not from the
// raw .js — this file is the single seam where the untyped module becomes typed.
import * as curriculumJs from "../../../../public/curriculum.js";
import type { Lesson, Tracks, Modules, Bridge, Project } from "./types";

const data = curriculumJs as unknown as {
  lessons: Lesson[];
  modules: Modules;
  tracks: Tracks;
  bridges: Bridge[];
  projects: Project[];
};

/** Every lesson across both tracks, in authored order (JS first, then C#). */
export const lessons: readonly Lesson[] = data.lessons;
/** Ordered module names; a lesson's `module` field indexes into this. */
export const modules: Modules = data.modules;
/** The two tracks, keyed by language. */
export const tracks: Tracks = data.tracks;
/** "Same idea in both languages" comparison cards. */
export const bridges: readonly Bridge[] = data.bridges;
/** Build-it-yourself projects, self-assessed by rubric. */
export const projects: readonly Project[] = data.projects;

/** Fast id → lesson lookup for the lesson route and progress rendering. */
export const lessonsById: ReadonlyMap<string, Lesson> = new Map(
  data.lessons.map((lesson) => [lesson.id, lesson]),
);

/** Resolve a lesson's numeric `module` to its name (empty string if out of range). */
export function moduleName(index: number): string {
  return data.modules[index] ?? "";
}

export type {
  Lesson,
  Lang,
  Track,
  Tracks,
  Modules,
  Bridge,
  Project,
  Rubric,
  RubricCriterion,
  Pitfall,
  Quiz,
  Challenge,
  ChallengeTest,
  Recall,
  RunResult,
} from "./types";
