import { lessons, tracks, modules, bridges, projects } from "./public/curriculum.js";

export function curriculumFor(premium = true) {
  const visible = lessons.map(lesson => premium || lesson.module === 0 ? lesson : {
    id: lesson.id, title: lesson.title, lang: lesson.lang, module: lesson.module, minutes: lesson.minutes, lead: lesson.lead,
    locked: true, sections: [], challenge: { tests: [] },
  });
  return { lessons: visible, modules, bridges, tracks: Object.fromEntries(Object.entries(tracks).map(([lang, track]) => [lang, { ...track, lessons: visible.filter(lesson => lesson.lang === lang) }])),
    projects: projects.map(project => premium || project.level === "Foundation" ? project : {
      id: project.id, title: project.title, lang: project.lang, level: project.level, summary: project.summary, time: project.time, skills: project.skills, locked: true,
    }) };
}
