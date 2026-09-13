export let lessons = [], tracks = {}, modules = [], bridges = [], projects = [];
export async function refreshCurriculum() {
  const response = await fetch("/api/curriculum");
  if (!response.ok) throw new Error("The curriculum could not be loaded. Refresh the page to try again.");
  ({ lessons, tracks, modules, bridges, projects } = await response.json());
}
await refreshCurriculum();
