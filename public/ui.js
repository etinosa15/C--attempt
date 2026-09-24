import { escapeHtml as e, highlight } from "./core.js";
import { tracks } from "./curriculum.js";

// State-free UI toolkit: DOM query shorthand, the inline SVG icon registry, and
// the pure presentational/format helpers. Nothing here reads app state, so these
// can be reused and reasoned about without the rest of app.js.
export const $ = (s) => document.querySelector(s);

const icons = {
  grid: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  path: "M4 5h6M4 12h10M4 19h16M17 3v4M14 5h6",
  code: "m8 7-5 5 5 5m8-10 5 5-5 5m-3-14-2 18",
  cards: "M7 3h13v15H7z M4 6H2v15h13v-2",
  folder: "M3 6h7l2 3h9v11H3z M3 6V4h7l2 2",
  note: "M5 3h14v18H5z M9 7h6M9 11h6M9 15h4",
  arrow: "M4 12h16m-6-6 6 6-6 6",
  chevron: "m9 5 7 7-7 7",
  search: "M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14m5 12 6 6",
  check: "m5 12 4 4L19 6",
  clock: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18m0 4v5l3 2",
  flame: "M12 3c2 6 7 6 7 12a7 7 0 0 1-14 0c0-3 2-6 4-7-1 4 1 4 1 4s3-4 2-9z",
  bolt: "m13 2-9 12h7l-1 8L21 9h-8z",
  book: "M12 5C8 2 3 3 3 3v16s5-1 9 2c4-3 9-2 9-2V3s-5-1-9 2zm0 0v16",
  settings:
    "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8m0-6v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2",
  play: "m8 4 12 8-12 8z",
  close: "m6 6 12 12M6 18 18 6",
  download: "M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5",
  menu: "M4 6h16M4 12h16M4 18h16",
  star: "m12 3 3 6 6 1-4 5 1 6-6-3-6 3 1-6-4-5 6-1z",
  terminal: "m5 7 5 5-5 5m8 0h6",
  external: "M14 3h7v7m0-7-11 11M10 3H3v18h18v-7",
  coffee: "M4 5h12v10a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zm12 1h2a3 3 0 0 1 0 6h-2",
  help: "M9 8a3 3 0 1 1 5 2c-2 1-2 2-2 4m0 3v1",
  moon: "M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z",
  sun: "M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10M12 2v2m0 16v2M4 12H2m20 0h-2M6 6 4.5 4.5M19.5 19.5 18 18M6 18l-1.5 1.5M19.5 4.5 18 6",
  cloud: "M7 18a4 4 0 0 1 0-8 5 5 0 0 1 9.6-1.5A3.5 3.5 0 0 1 17 18z",
  refresh: "M4 12a8 8 0 0 1 14-5m0-4v4h-4M20 12a8 8 0 0 1-14 5m0 4v-4h4",
  award: "M12 3a5 5 0 1 0 0 10 5 5 0 0 0 0-10m-3 9-2 9 5-3 5 3-2-9",
};
export const icon = (name, size = 20) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${icons[name] || icons.code}"/></svg>`;
// Guidance text names identifiers. Escape first, so the only markup that can
// survive is a backtick span turning into inline code.
export const prose = (text) => e(text).replace(/`([^`]+)`/g, "<code>$1</code>");
export function relativeTime(at, now = Date.now()) {
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  if (seconds < 10) return "just now";
  if (seconds < 60) return `${seconds} seconds ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return minutes === 1 ? "a minute ago" : `${minutes} minutes ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return hours === 1 ? "an hour ago" : `${hours} hours ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}
export const codeBlock = (code, label = "Example") =>
  `<div class="code-block"><div class="code-label"><span>${icon("code", 14)} ${e(label)}</span><span>READ · TRACE · UNDERSTAND</span></div><pre><code>${highlight(code)}</code></pre></div>`;
// Official Devicon language logos (jsDelivr, pinned) in place of the old "JS"/"C#"
// text badges. The logo carries meaning, so alt + title name the language; the alt
// text doubles as the graceful fallback when the CDN is unreachable (the offline
// local edition). Box + logo sizes come from CSS tokens; width/height attrs only
// reserve space to avoid layout shift.
const deviconPath = { js: "javascript/javascript-original", cs: "csharp/csharp-original" };
export const badge = (lang) =>
  `<span class="language-badge ${lang}"><img class="language-logo" src="https://cdn.jsdelivr.net/gh/devicons/devicon@v2.16.0/icons/${deviconPath[lang]}.svg" alt="${tracks[lang].name}" title="${tracks[lang].name}" width="24" height="24" loading="lazy" decoding="async" /></span>`;
export const sectionHead = (eyebrow, title, desc = "") =>
  `<div class="page-heading"><div class="eyebrow">${eyebrow}</div><h1>${title}</h1>${desc ? `<p>${desc}</p>` : ""}</div>`;
export const linkButton = (url, text, cls = "primary") =>
  `<a class="button ${cls}" href="${url}">${text}${icon("arrow", 17)}</a>`;
export function formatTime(n) {
  return (
    String(Math.floor(n / 60)).padStart(2, "0") +
    ":" +
    String(n % 60).padStart(2, "0")
  );
}
export function focusDuration(seconds) {
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}m ${String(whole % 60).padStart(2, "0")}s`;
}
