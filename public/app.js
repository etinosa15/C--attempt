import { lessons, tracks, modules, bridges, projects } from "./curriculum.js";
import { createRunnerClient } from "./runner-client.js";
import { createProgressStore, progressChanges, applyProgressChanges, BEFORE_SYNC_KEY } from "./progress-store.js";
import { createSyncClient } from "./sync-client.js";
import { dailyFocus } from "./focus.js";
import { createBuddy, emberSprite } from "./buddy.js";
import { createTutor, heuristicProvider, createRemoteProvider } from "./tutor.js";
import { hosted, syncOrigin, tutorOrigin } from "./deployment.js";
import { initDock } from "./dock.js";
import "./loader.js";
import {
  validateProgress,
  freshState,
  dayKey,
  streak,
  scheduleReview,
  escapeHtml as e,
  highlight,
  indentOnEnter,
  formatValue,
  valueKind,
  typeMismatch,
  explainError,
  hintTiers,
  certificateEarned,
  certificateSvg,
  rubricScore,
  resolveTheme,
  STORAGE_KEY,
} from "./core.js";
import {
  $,
  icon,
  prose,
  relativeTime,
  codeBlock,
  badge,
  sectionHead,
  linkButton,
  formatTime,
  focusDuration,
} from "./ui.js";

const mobileLayout = matchMedia("(max-width: 720px)");
// Appearance is a device-local preference kept OUTSIDE the progress state, so
// import/export and any future cloud sync never carry a theme between machines.
const THEME_KEY = "forge.academy.theme";
const darkQuery = matchMedia("(prefers-color-scheme: dark)");
function themePref() {
  const saved = localStorage.getItem(THEME_KEY);
  return saved === "dark" || saved === "light" || saved === "system" ? saved : "system";
}
function applyTheme(pref = themePref()) {
  document.documentElement.dataset.theme = resolveTheme(pref, darkQuery.matches);
}
// The topbar quick-toggle and the Settings radio group both reflect the theme, so
// keep them in step after any change (toggle, radio, or the OS flipping "System").
function syncThemeControls() {
  const dark = document.documentElement.dataset.theme === "dark";
  const toggle = document.querySelector(".theme-toggle");
  if (toggle) {
    const label = dark ? "Switch to light theme" : "Switch to dark theme";
    toggle.innerHTML = icon(dark ? "sun" : "moon", 18);
    toggle.setAttribute("aria-label", label);
    toggle.setAttribute("title", label);
  }
  const pref = themePref();
  for (const b of document.querySelectorAll("[data-theme-choice]")) {
    const on = b.dataset.themeChoice === pref;
    b.classList.toggle("selected", on);
    b.setAttribute("aria-pressed", String(on));
  }
}
// Re-resolve while "System" is selected so the OS switching modes repaints live.
darkQuery.addEventListener("change", () => {
  if (themePref() === "system") { applyTheme("system"); syncThemeControls(); }
});
applyTheme();
// The sticky topbar lifts off the page once anything scrolls under it. One passive
// listener toggles a class on whichever .topbar is currently mounted (shell()
// rebuilds it every route change), and scrollTo(0,0) on each render resets it.
addEventListener("scroll", () => {
  const bar = document.querySelector(".topbar");
  if (bar) bar.classList.toggle("scrolled", scrollY > 4);
}, { passive: true });
// Scroll-reveal: content blocks rise gently into view as they enter the viewport.
// The hidden pre-state lives only under html.reveal-ready, which is set ONLY when
// motion is allowed — so reduced-motion users (and a no-JS load) always see the
// page fully painted. #app is rebuilt every route change, so revealOnScroll() is
// called after each render to (re)tag and observe that render's fresh blocks.
const revealObserver = matchMedia("(prefers-reduced-motion: reduce)").matches
  ? null
  : new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("revealed");
          revealObserver.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
    );
if (revealObserver) document.documentElement.classList.add("reveal-ready");
function revealOnScroll() {
  if (!revealObserver) return;
  const main = $("#main");
  if (!main) return;
  // Every full-#app re-render replaces the nodes this observer was watching, so
  // release the old ones before tagging the new screen — otherwise detached
  // blocks from prior routes stay referenced and never get collected.
  revealObserver.disconnect();
  // Tag the current screen's top-level blocks. A small per-block index drives a
  // staggered delay in CSS, so a screen cascades in rather than snapping as a slab.
  const blocks = [...main.children];
  blocks.forEach((block, i) => {
    block.classList.add("reveal");
    block.style.setProperty("--reveal-i", String(Math.min(i, 6)));
  });
  // Blocks already in view when the screen mounts animate in on the next frame
  // (the hidden state paints first, then .revealed transitions it in) instead of
  // waiting on the observer, which some browsers hold until the tab is actually
  // displayed. Blocks below the fold are handed to the observer to reveal on scroll.
  const fold = (innerHeight || document.documentElement.clientHeight) * 0.92;
  requestAnimationFrame(() => {
    for (const block of blocks) {
      if (block.getBoundingClientRect().top < fold) block.classList.add("revealed");
      else revealObserver.observe(block);
    }
  });
}
// The study buddy lives in a body-level container (index.html), so it survives
// the full #app re-render on every route change. Its prefs are device-local, like
// the theme. The tutor is the heuristic (offline) provider by default.
const buddy = createBuddy({
  storage: localStorage,
  root: document.getElementById("buddy"),
  reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
});
// Pointer-reactive aurora: the ambient background drifts a touch toward the
// cursor so the ground feels alive without stealing focus. The CSS keyframe
// drift stays as the base; this only nudges the whole field. Skipped under
// reduced-motion and on coarse (touch) pointers where there is no hover.
(function initAuroraParallax() {
  const aurora = document.querySelector(".forge-aurora");
  if (!aurora) return;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)");
  const fine = matchMedia("(pointer: fine)");
  let raf = 0, tx = 0, ty = 0;
  function apply() {
    raf = 0;
    aurora.style.setProperty("--aurora-px", tx.toFixed(2));
    aurora.style.setProperty("--aurora-py", ty.toFixed(2));
  }
  addEventListener("pointermove", (e) => {
    if (reduce.matches || !fine.matches) return;
    // Drift opposite the cursor for a gentle sense of depth/parallax.
    tx = (e.clientX / innerWidth - 0.5) * -28;
    ty = (e.clientY / innerHeight - 0.5) * -28;
    if (!raf) raf = requestAnimationFrame(apply);
  }, { passive: true });
})();
// The tutor is the offline heuristic by default. When a build sets tutorOrigin,
// hosted hints upgrade the message through the proxy, falling back to the same
// heuristic on any failure — so the nudge is never worse than the offline one.
const tutor = createTutor({
  provider: tutorOrigin
    ? createRemoteProvider({ origin: tutorOrigin, fallback: heuristicProvider, getAuth: () => sync.sessionToken() })
    : heuristicProvider,
});
function focusTarget(target) {
  if (!target) return;
  if (!target.matches("a[href], button, input, textarea, select, summary")) target.tabIndex = -1;
  target.focus({ preventScroll: true });
}
function focusPageHeading() { focusTarget($("#main h1") || $("#main")); }
function syncNavigationLayout() {
  const sidebar = $("#sidebar"), toggle = $('[data-action="menu"]');
  if (!sidebar || !toggle) return;
  if (!mobileLayout.matches) sidebar.classList.remove("mobile-open");
  const open = mobileLayout.matches && sidebar.classList.contains("mobile-open");
  if (mobileLayout.matches && !open && sidebar.contains(document.activeElement)) toggle.focus();
  sidebar.inert = mobileLayout.matches && !open;
  if (sidebar.inert) sidebar.setAttribute("aria-hidden", "true");
  else sidebar.removeAttribute("aria-hidden");
  toggle.setAttribute("aria-expanded", String(open));
  toggle.setAttribute("aria-label", open ? "Close navigation" : "Open navigation");
  if (!mobileLayout.matches && document.activeElement === toggle) focusPageHeading();
}
function setNavigationOpen(open, returnFocus = false) {
  const sidebar = $("#sidebar");
  if (!sidebar) return;
  sidebar.classList.toggle("mobile-open", open && mobileLayout.matches);
  syncNavigationLayout();
  if (open && mobileLayout.matches) sidebar.querySelector("nav a")?.focus();
  else if (returnFocus && mobileLayout.matches) $('[data-action="menu"]')?.focus();
}
mobileLayout.addEventListener("change", syncNavigationLayout);
let state, storageOK = true, storageMessage = "", replacingProgress = false;
let status = { csharp: false },
  route = "",
  selectedReview = null,
  reviewRevealed = false,
  reviewAll = false,
  reviewedSession = 0,
  focusCommandBusy = false,
  focusCheckpointAt = 0,
  runBusy = false,
  currentWorker = null,
  output = null,
  outputContext = null,
  playLang = "js";
let searchQuery = "",
  pathFilter = "all",
  projectFilter = "all";
const runner = createRunnerClient({
  onStatus(data) {
    status = data;
    const label = $('.editor-shell[data-lang="cs"] .editor-status');
    if (label) label.textContent = ".NET " + (status.sdk || "");
    if (playLang === "cs" && $(".runtime-label"))
      $(".runtime-label").textContent = status.csharp ? "Real .NET compiler" : "SDK not available";
    if (route === "settings") renderSettings();
  },
});
const progressStore = createProgressStore({
  onStatus: updateStorageStatus,
  onChange(next, previous) {
    // Timer ticks may not have reached save() yet. Keep those local changes.
    state = replacingProgress ? next : applyProgressChanges(next, progressChanges(previous, state));
    if (!replacingProgress) {
      const focusOnly = progressChanges(previous, next).every(change =>
        ["focusTimer", "focusByDay", "focusSeconds", "activity"].includes(change.path[0]));
      if (focusOnly) updateFocusDisplay();
      else refreshSavedView();
    }
  },
});
state = progressStore.state;
storageMessage = progressStore.problem;
storageOK = !storageMessage;
// Cloud sync. With syncOrigin empty (the local edition and any build without a
// sync service) `enabled` is false and every method is a no-op: no requests, no
// account UI, byte-for-byte the local-first app. Only the hosted build sets it.
let syncMessage = "", syncBusy = false;
const sync = createSyncClient({
  origin: syncOrigin,
  readState: () => state,
  // The service's authoritative record, merged with anything that changed
  // locally in flight, comes back here. A first-contact merge replaces the
  // record wholesale (like an import); a delta merge folds into it.
  writeState: async (next, replace) => {
    if (replace) {
      replacingProgress = true;
      try { await progressStore.replace(next); } finally { replacingProgress = false; }
    } else {
      await progressStore.save(next);
    }
  },
  // Before the very first merge on this device, keep the exact pre-merge record
  // downloadable from Settings, so a merge the learner dislikes is reversible.
  onAdopt: async () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw !== null) localStorage.setItem(BEFORE_SYNC_KEY, raw);
    } catch { /* A missing backup is not worth blocking a sign-in over. */ }
  },
  onAuth() {
    if (route === "settings") renderSettings();
    refreshProfile();
  },
  onError(error) {
    syncMessage = error?.message || "Sync paused. Your progress is saved on this device.";
    if (route === "settings") renderSettings();
  },
});
function save() { const result = progressStore.save(state); sync.schedule(); return result; }
function refreshProfile() {
  const label = $("#sidebar .profile strong");
  if (label) label.textContent = sync.account ? sync.account.email : "Your personal academy";
}
function savedLabel() {
  const at = progressStore.lastSaved;
  return at ? `Saved ${relativeTime(at)}` : "Progress saved on this device";
}
function updateStorageStatus(message = storageMessage) {
  storageMessage = message;
  storageOK = !message;
  const banner = $("#storage-warning");
  if (banner) {
    banner.hidden = !message || message === "Saving progress…";
    $("#storage-message").textContent = message;
  }
  const label = $(".profile small");
  if (label) label.textContent = message === "Saving progress…" ? message : storageOK ? savedLabel() : "Progress needs attention";
  const detail = $("#storage-detail");
  if (detail)
    detail.textContent = message || (progressStore.lastSaved
      ? `This browser · saved ${relativeTime(progressStore.lastSaved)}`
      : "This browser · automatic recovery backup");
}
function refreshSavedView() {
  updateFocusDisplay();
  for (const el of document.querySelectorAll("textarea")) {
    let value;
    if (el.dataset.note) value = state.notes[el.dataset.note] || "";
    else if (el.id === "code-editor") value = state.drafts[$(".editor-shell").dataset.editorKey];
    else if (["dom-html", "dom-js"].includes(el.id)) value = state.drafts[el.id];
    if (value !== undefined && el.value !== value) {
      const start = el.selectionStart, end = el.selectionEnd;
      el.value = value;
      el.setSelectionRange(start, end);
      if (el.id === "code-editor") {
        $(".line-numbers").textContent = value.split("\n").map((_, i) => i + 1).join("\n");
        const shell = el.closest(".editor-shell");
        const overlay = shell?.querySelector(".editor-highlight code");
        if (overlay) overlay.innerHTML = highlight(value, shell.dataset.lang);
      }
    }
  }
  for (const el of document.querySelectorAll("input[data-project]"))
    el.checked = (state.projectChecks[el.dataset.project] || []).includes(Number(el.dataset.step));
  for (const el of document.querySelectorAll("input[data-rubric]"))
    el.checked = (state.rubrics[el.dataset.rubric] || []).includes(Number(el.dataset.criterion));
  const lesson = lessons.find(l => l.id === location.hash.split("?")[0].split("/")[1]);
  if (route === "lesson" && lesson) refreshCompletion(lesson);
  if (!runBusy && route !== "playground" && !$("#search-dialog") &&
      !document.activeElement?.matches("a, button, input, textarea, select, iframe, summary, [tabindex]")) {
    const y = window.scrollY;
    shell();
    window.scrollTo(0, y);
  }
}
function recordActivity() {
  const k = dayKey();
  state.activity[k] = (Number(state.activity[k]) || 0) + 1;
  save();
}
function toast(message) {
  $("#toast").textContent = message;
  $("#toast").classList.add("visible");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => $("#toast").classList.remove("visible"), 4000);
}
const progress = (lang) => {
  const list = lang ? tracks[lang].lessons : lessons;
  return Math.round(
    (list.filter((l) => state.completed.includes(l.id)).length / list.length) *
      100,
  );
};
const nextLesson = (lang) =>
  tracks[lang].lessons.find((l) => !state.completed.includes(l.id)) ||
  tracks[lang].lessons[0];
const resumeLesson = () =>
  lessons.find(
    (l) => l.id === state.lastLesson && !state.completed.includes(l.id),
  ) ||
  lessons.find((l) => !state.completed.includes(l.id)) ||
  lessons[0];
const dueCards = (includeUnlearned = reviewAll) =>
  lessons.filter(
    (l) =>
      (includeUnlearned || state.completed.includes(l.id)) &&
      (!state.reviews[l.id] || Number(state.reviews[l.id].due) <= Date.now()),
  );
const xp = () =>
  state.completed.length * 100 +
  state.solved.length * 40 +
  Object.values(state.quizzes).filter(Boolean).length * 10;

// The topbar sits outside #main, so views that re-render only #main (completing
// a lesson, for one) have to refresh this control themselves.
function resumeControlMarkup() {
  const parts = location.hash.slice(1).split("?")[0].split("/");
  const viewing =
    parts[0] === "lesson" && lessons.some((l) => l.id === parts[1]) ? parts[1] : null;
  const resume = resumeLesson();
  // Never send a learner back to the page they are already reading.
  if (resume.id === viewing || (viewing && !state.completed.includes(viewing))) return "";
  const verb = state.lastLesson || state.completed.length ? "Continue" : "Start";
  return `<a class="resume-link" href="#lesson/${resume.id}" aria-label="${verb} lesson: ${e(resume.title)}">${icon("play", 15)}<span class="resume-verb">${verb}</span><span class="resume-title">${e(resume.title)}</span></a>`;
}
function syncResumeControl() {
  const bar = $(".topbar-right");
  if (!bar) return;
  const markup = resumeControlMarkup();
  const current = $(".resume-link");
  if (!markup) current?.remove();
  else if (current) current.outerHTML = markup;
  else bar.insertAdjacentHTML("afterbegin", markup);
}
// The XP pill lives in the persistent topbar, so #main-only re-renders (solving a
// challenge, completing a lesson, answering a concept check) refresh it here rather
// than rebuilding the whole shell.
function syncXpDisplay() {
  const el = $(".xp-pill strong");
  if (el) el.textContent = xp().toLocaleString();
}
function shell() {
  const parts = location.hash.slice(1).split("?")[0].split("/");
  route = parts[0] || "overview";
  const titles = {
    overview: "Overview",
    paths: "Learning paths",
    lesson: "Learning paths",
    playground: "Playground",
    review: "Review deck",
    projects: "Projects",
    project: "Projects",
    notebook: "Notebook",
    settings: "Settings",
    "local-setup": "Local C# setup",
    privacy: "Privacy & storage",
    terms: "Terms of use",
  };
  const nav = [
    ["overview", "grid", "Overview"],
    ["paths", "path", "Learning paths"],
    ["playground", "code", "Playground"],
    ["review", "cards", "Review deck"],
    ["projects", "folder", "Projects"],
    ["notebook", "note", "Notebook"],
  ];
  // renderLesson writes state.lastLesson after this markup is built, so treat
  // the lesson being opened as the current one. Never send a learner back to
  // the page they are already reading.
  const resumeControl = resumeControlMarkup();
  $("#app").innerHTML =
    `<aside class="sidebar" id="sidebar"><button class="sidebar-close" data-action="close-menu" aria-label="Close navigation">${icon("close", 18)} Close</button><a href="#overview" class="brand"><span class="brand-mark"><svg class="brand-ember" viewBox="0 0 64 64" aria-hidden="true"><path d="M33 11c4 11 15 14 15 27a16 16 0 0 1-32 0c0-6 3-11 8-14-1 7 3 9 3 9s6-8 6-22z"/><path class="brand-ember-inner" d="M32 30c2 5 6 6 6 12a6 6 0 0 1-12 0c0-3 1-5 3-6 0 3 1 4 1 4s2-3 2-6z"/></svg></span><span>forge<span class="brand-sub">CODE ACADEMY</span></span></a><div class="workspace-label">YOUR LEARNING SPACE</div><nav aria-label="Main navigation">${nav.map(([id, ico, label]) => `<a href="#${id}" class="nav-item ${route === id || (route === "lesson" && id === "paths") || (route === "project" && id === "projects") ? "active" : ""}">${icon(ico)}<span>${label}</span>${id === "review" && dueCards(false).length ? `<span class="nav-count">${dueCards(false).length}</span>` : ""}${id === "playground" ? '<span class="nav-dot"></span>' : ""}</a>`).join("")}</nav><div class="sidebar-bottom"><div class="sidebar-streak">${icon("flame", 18)}<div><strong>${streak(state.activity)}</strong><span>day streak</span></div></div><div class="sidebar-tip"><strong>Small steps. Real skills.</strong><p>A little focused practice today<br>goes a long way tomorrow.</p><a href="#settings">Your daily goal <span>${state.goal} min ${icon("chevron", 12)}</span></a></div><a class="nav-item settings-link ${route === "settings" ? "active" : ""}" href="#settings">${icon("settings")}<span>Settings & backups</span></a><div class="profile"><div class="avatar">Y</div><div><strong>${sync.account ? e(sync.account.email) : "Your personal academy"}</strong><small><i class="status-dot"></i> ${storageOK ? savedLabel() : "Storage unavailable"}</small></div></div></div></aside><div class="main-shell"><header class="topbar"><button class="icon-button mobile-menu" aria-label="Open navigation" aria-controls="sidebar" aria-expanded="false" data-action="menu">${icon("menu")}</button><div class="breadcrumbs">Your workspace <span>/</span> <strong>${titles[route] || "Overview"}</strong></div><div class="topbar-right">${resumeControl}<button class="search-trigger liquid-glass" data-action="search" aria-label="Search lessons" aria-keyshortcuts="Control+k Meta+k">${icon("search", 17)}<span>Find a lesson</span><kbd>Ctrl K</kbd></button>${(() => { const dark = document.documentElement.dataset.theme === "dark"; const label = dark ? "Switch to light theme" : "Switch to dark theme"; return `<button class="theme-toggle liquid-glass" data-action="toggle-theme" aria-label="${label}" title="${label}">${icon(dark ? "sun" : "moon", 18)}</button>`; })()}<div class="xp-pill liquid-glass" title="${xp().toLocaleString()} XP earned so far">${icon("bolt", 18)}<strong>${xp().toLocaleString()}</strong><span>XP earned</span></div><div class="streak liquid-glass" title="${streak(state.activity)} day streak">${icon("flame", 18)}<strong>${streak(state.activity)}</strong><span>day streak</span></div><div class="top-avatar">Y</div></div></header><main id="main" tabindex="-1"></main><footer class="page-footer"><span>Made for the way you learn. Built for what comes next.</span><span class="footer-links"><a href="#local-setup">Local C# setup</a><a href="#privacy">Privacy &amp; storage</a><a href="#terms">Terms of use</a></span></footer></div>`;
  if (route === "paths") renderPaths(parts[1]);
  else if (route === "lesson") renderLesson(parts[1]);
  else if (route === "playground") {
    const lang = new URLSearchParams(location.hash.split("?")[1]).get("lang");
    if (["js", "cs"].includes(lang)) playLang = lang;
    renderPlayground();
  }
  else if (route === "review") renderReview();
  else if (route === "projects") renderProjects();
  else if (route === "project") renderProject(parts[1]);
  else if (route === "notebook") renderNotebook();
  else if (route === "settings") renderSettings();
  else if (route === "local-setup") renderLocalSetup();
  else if (route === "privacy") renderPrivacy();
  else if (route === "terms") renderTerms();
  else if (route === "overview") renderOverview();
  else $("#main").innerHTML = sectionHead("PAGE NOT FOUND", "Let’s get you back on track.", "This link does not match a page in Forge.") + linkButton("#overview", "Return to overview");
  const title = route === "lesson" ? lessons.find(l => l.id === parts[1])?.title
    : route === "project" ? projects.find(p => p.id === parts[1])?.title : titles[route];
  document.title = `${title || "Page not found"} — Forge Code Academy`;
  syncSelectedControls();
  window.scrollTo(0, 0);
  updateStorageStatus();
  updateFocusDisplay();
  syncNavigationLayout();
  initDock($("#sidebar nav"));
  revealOnScroll();
  document.querySelectorAll(".nav-item.active").forEach(link => link.setAttribute("aria-current", "page"));
}

function heroArt() {
  return `<div class="hero-art" aria-hidden="true"><div class="orbit orbit-one"></div><div class="orbit orbit-two"></div><div class="orbit-dot one"></div><div class="orbit-dot two"></div><div class="float-code tiny top">const future = <em>"yours";</em></div><div class="art-tile js-tile">JS<span>create.</span></div><div class="art-tile cs-tile">C#<span>engineer.</span></div><div class="art-link">${icon("code", 26)}</div><div class="float-code bottom"><span class="terminal-dot"></span> Hello, possibility<span class="cursor">▏</span></div></div>`;
}
function welcomePanel() {
  const steps = [
    ["01", "book", "Understand", "Read the concept, then trace a worked example line by line."],
    ["02", "help", "Predict", "Answer one question before you write any code."],
    ["03", "code", "Write real code", "Solve the challenge. Every check runs your code for real."],
    ["04", "cards", "Reflect", "Explain it in your own words, then complete the lesson."],
  ];
  return `<section class="welcome-panel" aria-labelledby="welcome-heading"><button class="welcome-close" data-action="dismiss-welcome" aria-label="Dismiss getting started">${icon("close", 18)}</button><div class="eyebrow">NEW HERE?</div><h2 id="welcome-heading">Begin with one lesson. Here is how every one works.</h2><ol class="welcome-steps">${steps
    .map(([n, i, h, p]) => `<li><span class="welcome-number">${n}</span>${icon(i, 18)}<div><strong>${h}</strong><span>${p}</span></div></li>`)
    .join("")}</ol><div class="welcome-choice"><p>Pick a language and start your first lesson:</p><div class="welcome-buttons">${["js", "cs"]
    .map((lang) => `<a class="button ${lang === "js" ? "primary" : "secondary"}" href="#lesson/${nextLesson(lang).id}" data-action="begin"><span>${tracks[lang].name}<small>${e(nextLesson(lang).title)}</small></span>${icon("arrow", 17)}</a>`)
    .join("")}</div></div><p class="welcome-note">${icon("help", 15)}<span>Progress saves in this browser${sync.enabled ? " — add an optional account to sync across devices" : " — no account, nothing uploaded"}. <a href="#privacy">Where your work lives</a>.${hosted ? ` C# lessons are readable here, but running C# needs the <a href="#local-setup">local edition</a>.` : ""}</span></p></section>`;
}
function renderOverview() {
  const resume = resumeLesson();
  const due = lessons.filter(
    (l) =>
      state.completed.includes(l.id) &&
      (!state.reviews[l.id] || state.reviews[l.id].due <= Date.now()),
  ).length;
  const today = new Date();
  const daily =
    lessons[
      Math.floor(
        Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) /
          86400000,
      ) % lessons.length
    ];
  $("#main").innerHTML =
    `<div class="overview-heading"><div><div class="eyebrow">A LITTLE PRACTICE. A LOT OF POSSIBILITY.</div><h1>Your next chapter starts here<span class="lavender-dot">.</span></h1><p>Two powerful languages. One space to make them yours.</p></div><div class="date-label">${today.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "long" })}</div></div>${state.onboarded ? "" : welcomePanel()}<section class="hero"><div class="hero-copy"><div class="hero-kicker"><span></span> LEARN IT. WRITE IT. MAKE IT STICK.</div><h2>Don’t just learn code.<br>Learn to <em>think in it.</em></h2><p>Go from “I get it” to “I built it” with deep lessons,<br class="desktop-break"> real coding challenges, and practice that stays with you.</p><div class="hero-actions">${linkButton("#lesson/" + resume.id, `<span>${state.lastLesson ? "Continue learning" : "Start your journey"}<small>${e(resume.title)}</small></span>`)}<span>At your pace. On your terms.</span></div></div>${heroArt()}</section><div class="stats-row"><div class="stat">${icon("book")}<div><strong>${state.completed.length}<span> / 40</span></strong><small>Lessons completed</small></div></div><div class="stat">${icon("code")}<div><strong>${state.solved.length}</strong><small>Challenges solved</small></div></div><div class="stat">${icon("bolt")}<div><strong>${xp().toLocaleString()}<span> XP</span></strong><small>Knowledge earned</small></div></div><div class="stat">${icon("clock")}<div><strong data-focus-lifetime>${Math.floor(state.focusSeconds / 60)}<span> min</span></strong><small>Lifetime focused practice</small></div></div></div><div class="dashboard-columns"><div class="dashboard-primary"><div class="section-title"><h2>Your learning paths <span>02</span></h2><a href="#paths">Explore curriculum ${icon("arrow", 16)}</a></div><div class="course-grid">${["js", "cs"].map((lang) => courseCard(lang)).join("")}</div><div class="section-title lower"><h2>A little structure. A lot of progress.</h2></div><div class="method-row">${[
      ["01", "book", "Understand", "Go beneath the syntax."],
      ["02", "code", "Put it to work", "Write it. Run it. Refine it."],
      ["03", "cards", "Make it stick", "Recall today. Retain tomorrow."],
    ]
      .map(
        ([n, i, h, p]) =>
          `<div class="method-card"><span class="method-number">${n}</span>${icon(i, 21)}<h3>${h}</h3><p>${p}</p></div>`,
      )
      .join(
        "",
      )}</div><div class="bridge-banner"><span class="bridge-symbol">JS <i>⇄</i> C#</span><div><h3>Two languages. Stronger understanding.</h3><p>Compare the same ideas and see what really makes each language tick.</p></div><a href="#paths/compare" class="icon-button" aria-label="Compare JavaScript and C#">${icon("arrow")}</a></div></div><aside class="dashboard-aside"><div class="daily-card"><div class="daily-label">${icon("bolt", 17)} THE DAILY CHALLENGE <span>↗</span></div><span class="mini-tag">${tracks[daily.lang].name} · ${modules[daily.module]}</span><h3>${daily.title}</h3><p>A fresh problem. A sharper mind.<br>Put your knowledge into practice.</p><a href="#lesson/${daily.id}" class="daily-button">Take the challenge ${icon("arrow", 17)}</a><div class="daily-bottom"><span>${icon("clock", 13)} 10–15 min practice</span><span>+40 XP</span></div></div><div class="review-card"><div class="review-card-top"><span class="review-icon">${icon("cards", 22)}</span><span class="pill">ACTIVE RECALL</span></div><h3>A second look goes a long way.</h3><p>${due ? `${due} learned concept${due === 1 ? " is" : "s are"} ready for review.` : state.completed.length ? "You are all caught up. Your learned concepts will return when they are due." : "Complete a lesson to start your personal review deck."}</p><a href="#review">${due ? "Review your cards" : "Explore the review deck"} ${icon("arrow", 16)}</a></div><div class="daily-goal">${dailyFocusMarkup()}<a href="#playground">Open the focus playground ${icon("arrow", 15)}</a></div></aside></div>`;
}
function courseCard(lang) {
  const tr = tracks[lang],
    p = progress(lang),
    n = nextLesson(lang);
  return `<article class="course-card ${lang}"><div class="course-top">${badge(lang)}<span class="course-level">BEGINNER → ADVANCED</span></div><h3>${tr.name}</h3><p>${tr.description}</p><div class="course-meta"><span>${icon("book", 15)} 20 lessons</span><span>${icon("code", 15)} 20 challenges</span></div><div class="course-progress-label"><span>Your progress</span><strong>${p}%</strong></div><div class="progress-track"><div style="width:${p}%"></div></div><a href="#lesson/${n.id}" class="course-link"><span>${p ? "Continue path" : "Start learning"}<small>${e(n.title)}</small></span>${icon("arrow", 20)}</a></article>`;
}
function renderPaths(filter) {
  if (["js", "cs", "compare", "all"].includes(filter)) pathFilter = filter;
  $("#main").innerHTML =
    sectionHead(
      "YOUR ROADMAP",
      "Learn the why. Master the how.",
      "Forty focused lessons. Every one turns a concept into something you can do.",
    ) +
    `<div class="tabs liquid-glass" role="group" aria-label="Choose curriculum"><button data-path="all" class="${pathFilter === "all" ? "selected" : ""}">All paths</button><button data-path="js" class="${pathFilter === "js" ? "selected" : ""}">JavaScript <span>20</span></button><button data-path="cs" class="${pathFilter === "cs" ? "selected" : ""}">C# <span>20</span></button><button data-path="compare" class="${pathFilter === "compare" ? "selected" : ""}">Language bridge ${icon("code", 15)}</button></div>` +
    (pathFilter === "compare"
      ? `<div class="bridge-grid">${bridges.map((b) => `<article class="panel bridge-detail"><h2>${b.title}</h2><div class="comparison-code">${codeBlock(b.js, "JavaScript")}${codeBlock(b.cs, "C#")}</div><p>${b.note}</p></article>`).join("")}</div>`
      : ["js", "cs"]
          .filter((l) => pathFilter === "all" || l === pathFilter)
          .map(
            (lang) =>
              `<section class="path-section"><div class="path-heading">${badge(lang)}<div><h2>${tracks[lang].name}</h2><p>${tracks[lang].tag.toLowerCase()}</p></div><span>${progress(lang)}% complete</span>${progress(lang) === 100 ? `<button class="button secondary path-cert" data-action="view-certificate" data-lang="${lang}">${icon("award", 15)} View certificate</button>` : ""}</div><div class="module-grid">${modules
                .map(
                  (module, i) =>
                    `<div class="module panel"><div class="module-title"><span>0${i + 1}</span><div><h3>${module}</h3><small>${tracks[lang].lessons.filter((l) => l.module === i).reduce((s, l) => s + l.minutes, 0)} min · 4 lessons</small></div></div>${tracks[
                      lang
                    ].lessons
                      .filter((l) => l.module === i)
                      .map(
                        (l, j) =>
                          `<a class="lesson-row ${state.completed.includes(l.id) ? "done" : ""}" href="#lesson/${l.id}"><span class="lesson-order">${state.completed.includes(l.id) ? icon("check", 15) : String(i * 4 + j + 1).padStart(2, "0")}</span><span>${l.title}<small>${l.minutes} min · Lesson + challenge</small></span>${icon("chevron", 14)}</a>`,
                      )
                      .join("")}</div>`,
                )
                .join("")}</div></section>`,
          )
          .join(""));
  // The curriculum tab bar is a dock-like row: give it the same proximity
  // magnify as the sidebar nav, along its horizontal axis — but far gentler, so
  // it reads as a soft settle rather than the full macOS-dock swell.
  initDock($(".tabs"), { axis: "x", selector: "button", scale: 0.05, shift: 2, radius: 68 });
}
// Staged help that unlocks one tier at a time — either as the learner's checks
// keep failing (see runCode) or on demand. hintTiers(lesson) decides the tiers;
// state.hints[id] tracks how many are revealed. Pure markup, delegated handler.
function renderHints(l) {
  const tiers = hintTiers(l);
  const unlocked = Math.min(state.hints[l.id] || 0, tiers.length);
  const revealed = tiers
    .slice(0, unlocked)
    .map((tier) =>
      tier.solution
        ? `<details class="hint-tier hint-solution" open><summary>${e(tier.title)}</summary><p>Try it yourself first. After reading, close this and rebuild the solution from memory.</p>${codeBlock(l.challenge.solution, "One possible solution")}</details>`
        : `<div class="hint-tier"><div class="hint-tier-head">${icon("help", 15)} <strong>${e(tier.title)}</strong></div><p>${e(tier.body)}</p></div>`,
    )
    .join("");
  const nextTier = tiers[unlocked];
  const button = nextTier
    ? `<button class="button hint-reveal" data-action="reveal-hint" data-lesson="${l.id}">${icon("help", 15)} ${unlocked === 0 ? "Show a hint" : nextTier.solution ? "Reveal the worked solution" : "Show another hint"}</button>`
    : "";
  const lead = unlocked === 0
    ? `<p class="hint-lead">Stuck? Reveal staged help one step at a time. Hints also surface on their own as your checks keep coming up short.</p>`
    : "";
  return `<div id="lesson-hints" class="hint-actions">${lead}${revealed}${button}</div>`;
}
function renderLesson(id) {
  const l = lessons.find((l) => l.id === id);
  if (!l) {
    $("#main").innerHTML =
      '<div class="empty-state"><h1>Lesson not found</h1><a href="#paths">Browse learning paths</a></div>';
    return;
  }
  state.lastLesson = id;
  save();
  const list = tracks[l.lang].lessons,
    index = list.indexOf(l),
    done = state.completed.includes(id);
  const next = list[index + 1];
  $("#main").innerHTML =
    `<a href="#paths/${l.lang}" class="back-link">← ${tracks[l.lang].name} learning path</a><div class="lesson-heading"><div class="eyebrow">${modules[l.module].toUpperCase()} <span>·</span> LESSON ${String(index + 1).padStart(2, "0")} OF 20</div><h1>${e(l.title)}</h1><p>${e(l.lead)}</p><div class="lesson-meta">${badge(l.lang)}<span>${icon("clock", 15)} ${l.minutes} min</span><span>${icon("bolt", 15)} Up to 150 XP</span>${done ? '<span class="success-text">✓ Completed</span>' : ""}</div></div><div class="lesson-layout"><article class="lesson-content"><section id="understand"><div class="lesson-section-heading"><span>01</span><h2>Build your mental model</h2></div>${l.sections.map(([h, p]) => `<section class="prose-section"><h3>${h}</h3><p>${e(p)}</p></section>`).join("")}${codeBlock(l.example, tracks[l.lang].name + " · worked example")}<p class="example-explanation">${e(l.explanation)}</p><div class="callout"><span>${icon("bolt", 19)}</span><div><strong>Watch for this</strong><p>${e(l.trap)}</p></div></div></section><section id="predict" class="lesson-section"><div class="lesson-section-heading"><span>02</span><h2>Pause. Predict. Then check.</h2></div><div class="quiz panel"><div class="eyebrow">CHECK YOUR UNDERSTANDING</div><h3>${e(l.quiz.question)}</h3><form id="quiz-form" data-lesson="${id}"><fieldset><legend class="sr-only">Choose an answer</legend>${l.quiz.choices.map((choice, i) => `<label class="quiz-choice"><input type="radio" name="answer" value="${i}" required><span class="choice-letter">${String.fromCharCode(65 + i)}</span><span>${e(choice)}</span></label>`).join("")}</fieldset><button type="submit" class="button secondary">Check answer ${icon("arrow", 16)}</button></form><div id="quiz-feedback" role="status">${state.quizzes[id] ? `<div class="feedback success">${icon("check")}<p><strong>Concept checked.</strong> ${e(l.quiz.why)}</p></div>` : ""}</div></div></section><section id="practice" class="lesson-section"><div class="lesson-section-heading"><span>03</span><h2>Make the code yours</h2></div><p class="challenge-prompt">${e(l.challenge.prompt)}</p>${editor(l.lang, id, l.challenge.starter, true)}${renderHints(l)}</section><section id="reflect" class="lesson-section"><div class="lesson-section-heading"><span>04</span><h2>Explain it in your own words</h2></div><p>${e(l.recall.question)}</p><label class="sr-only" for="lesson-notes">Your notes for this lesson</label><textarea id="lesson-notes" class="notes-input" data-note="${id}" placeholder="What clicked? What would you explain to a friend? Write it here…">${e(state.notes[id] || "")}</textarea><div class="notes-caption">${icon("note", 14)} Saved automatically to your notebook.</div><div class="completion-panel"><div><h3>${done ? "One more concept, made yours." : "Ready to make it stick?"}</h3><p id="completion-hint">${completionHint(l)}</p></div><button class="button primary" data-complete="${id}" ${!canComplete(l) || done ? "disabled" : ""}>${done ? "Lesson complete" : "Complete lesson"} ${icon("check", 17)}</button></div>${done ? nextStepPanel(l) : ""}</section></article><aside class="lesson-aside"><div class="lesson-toc panel"><div class="eyebrow">THIS SESSION</div><button data-scroll="understand"><span>01</span> Understand the concept</button><button data-scroll="predict"><span>02</span> Check your intuition <i id="quiz-status">${state.quizzes[id] ? "✓" : ""}</i></button><button data-scroll="practice"><span>03</span> Write real code <i id="code-status">${state.solved.includes(id) ? "✓" : ""}</i></button><button data-scroll="reflect"><span>04</span> Reflect & remember</button><div class="toc-bottom">Learning happens when<br>you do the thinking.</div></div><div class="source-card">${icon("book", 22)}<h3>Go to the source</h3><p>Explore the language reference when you want to go deeper.</p><a href="${e(l.docs)}" target="_blank" rel="noopener noreferrer">${l.lang === "js" ? "MDN Web Docs" : "Microsoft Learn"} ${icon("external", 14)}</a></div><div class="lesson-next"><small>${next ? "UP NEXT" : "PATH FINALE"}</small><strong>${next ? e(next.title) : "Build your capstone project"}</strong><a href="${next ? "#lesson/" + next.id : "#projects"}">${next ? "Preview lesson" : "Explore projects"} ${icon("arrow", 14)}</a></div></aside></div>`;
  bindEditor();
}
function canComplete(l) {
  return !!state.quizzes[l.id] && state.solved.includes(l.id);
}
// Five modules, three projects per language: the brief a finished module has
// actually prepared the learner for.
const moduleProjectLevels = ["Foundation", "Foundation", "Intermediate", "Intermediate", "Capstone"];
function nextStepPanel(l) {
  const list = tracks[l.lang].lessons;
  const next = list[list.indexOf(l) + 1];
  const cards = [];
  if (next)
    cards.push(["UP NEXT", next.title, "#lesson/" + next.id, `Lesson ${list.indexOf(next) + 1} of 20 · ${next.minutes} min`]);
  const moduleDone = list.filter((x) => x.module === l.module).every((x) => state.completed.includes(x.id));
  const project = projects.find((p) => p.lang === l.lang && p.level === moduleProjectLevels[l.module]);
  if (moduleDone && project)
    cards.push([`${modules[l.module].toUpperCase()} COMPLETE`, project.title, "#project/" + project.id, "Put the whole module to work"]);
  if (!next) {
    const other = l.lang === "js" ? "cs" : "js";
    const remaining = tracks[other].lessons.some((x) => !state.completed.includes(x.id));
    cards.push(remaining
      ? [`THE ${tracks[other].short} PATH`, nextLesson(other).title, "#lesson/" + nextLesson(other).id, `See the same ideas in ${tracks[other].name}`]
      : ["ALL FORTY LESSONS DONE", "Choose a project", "#projects", "Build something that is entirely yours"]);
  }
  return `<div class="next-step-panel"><div class="next-step-head"><span class="next-step-mark">${icon("check", 18)}</span><div><strong>Saved to your review deck.</strong><p>A recall card for ${e(l.title)} is waiting. Rating it tomorrow is what turns this into memory. <a href="#review">Open your review deck ${icon("arrow", 14)}</a></p></div></div><div class="next-step-cards">${cards
    .map(([eyebrow, title, href, note]) => `<a class="next-step-card" href="${href}"><small>${eyebrow}</small><strong>${e(title)}</strong><span>${e(note)}</span>${icon("arrow", 16)}</a>`)
    .join("")}</div></div>`;
}
function completionHint(l) {
  return state.completed.includes(l.id)
    ? "Your review card is ready. Revisit it to strengthen your recall."
    : canComplete(l)
      ? "You checked the concept and passed every code test. Add this to your review deck."
      : "Check the concept question and pass the coding challenge to complete this lesson.";
}
function refreshCompletion(l) {
  const b = $(`[data-complete="${l.id}"]`);
  if (b) b.disabled = !canComplete(l) || state.completed.includes(l.id);
  if ($("#completion-hint"))
    $("#completion-hint").textContent = completionHint(l);
  if ($("#quiz-status"))
    $("#quiz-status").textContent = state.quizzes[l.id] ? "✓" : "";
  if ($("#code-status"))
    $("#code-status").textContent = state.solved.includes(l.id) ? "✓" : "";
}
function editor(lang, key, starter, challenge = false) {
  const draft = state.drafts[key] ?? starter;
  const same = outputContext === key && output;
  const localOnly = hosted && lang === "cs";
  return `${localOnly ? csharpNotice() : ""}<div class="editor-shell" data-editor-key="${key}" data-lang="${lang}" data-challenge="${challenge}"><div class="editor-toolbar"><span>${icon("code", 16)} ${lang === "js" ? "practice.js" : "Program.cs"} <i class="editor-status">${lang === "js" ? "JavaScript" : (hosted ? "Local edition required" : ".NET " + e(status.sdk || ""))}</i></span><div><button class="editor-reset" data-action="reset-code" title="Restore starter code">Reset</button><kbd>Ctrl ↵</kbd></div></div><div class="editor-area"><div class="line-numbers" aria-hidden="true">${draft
    .split("\n")
    .map((_, i) => i + 1)
    .join(
      "\n",
    )}</div><pre class="editor-highlight" aria-hidden="true"><code>${highlight(draft, lang)}</code></pre><label class="sr-only" for="code-editor">${tracks[lang].name} code editor</label><textarea id="code-editor" aria-describedby="editor-keyboard-help" spellcheck="false" autocapitalize="off" autocomplete="off" autocorrect="off" wrap="off">${e(draft)}</textarea></div><p class="editor-keyboard-help" id="editor-keyboard-help"><kbd>Tab</kbd> indents · <kbd>Shift+Tab</kbd> moves back · <kbd>Esc</kbd> leaves the editor · <kbd>Ctrl/⌘+Enter</kbd> ${localOnly ? "requires the local edition" : challenge ? "checks your solution" : "runs code"}.</p><div class="editor-bottom"><span><i class="status-dot"></i> ${lang === "js" ? "Runs in an isolated worker" : (hosted ? "Read and edit here; run C# in the local edition" : "Runs locally on your computer · use code you trust")}</span><div><button class="button editor-run" data-action="run-code" ${runBusy || localOnly ? "disabled" : ""}${localOnly ? ` title="Running C# requires the local edition"` : ""}>${icon("play", 14)} Run code</button>${challenge ? `<button class="button primary" data-action="test-code" ${runBusy || localOnly ? "disabled" : ""}${localOnly ? ` title="Checking C# solutions requires the local edition"` : ""}>${icon("check", 16)} Check solution</button>` : ""}</div></div><div class="output-panel"><div class="output-heading"><span>${icon("terminal", 15)} OUTPUT ${challenge ? "<i>& TEST RESULTS</i>" : ""}</span><button data-action="clear-output" aria-label="Clear output">Clear</button></div><div id="code-output" role="status" aria-live="polite">${same ? outputMarkup(output, lang) : '<div class="output-empty">Your next discovery starts with a run.<span>Write some code, then see what happens.</span></div>'}</div></div></div>`;
}
function bindEditor() {
  const ed = $("#code-editor");
  if (!ed) return;
  const holder = $(".editor-shell");
  const lang = holder.dataset.lang;
  const overlay = holder.querySelector(".editor-highlight code");
  const overlayBox = holder.querySelector(".editor-highlight");
  ed.addEventListener("input", () => {
    state.drafts[holder.dataset.editorKey] = ed.value;
    save();
    $(".line-numbers").textContent = ed.value
      .split("\n")
      .map((_, i) => i + 1)
      .join("\n");
    if (overlay) overlay.innerHTML = highlight(ed.value, lang);
  });
  ed.addEventListener("scroll", () => {
    $(".line-numbers").scrollTop = ed.scrollTop;
    // The overlay clips (overflow:hidden); scroll it programmatically so the
    // coloured layer tracks the textarea on both axes.
    if (overlayBox) {
      overlayBox.scrollTop = ed.scrollTop;
      overlayBox.scrollLeft = ed.scrollLeft;
    }
  });
  ed.addEventListener("keydown", (ev) => {
    if (ev.isComposing) return;
    if (ev.key === "Escape") {
      ev.preventDefault();
      ev.stopPropagation();
      focusTarget(holder.querySelector(".editor-bottom button:not(:disabled)") || holder.querySelector('[data-action="clear-output"]'));
      return;
    }
    if (ev.key === "Tab" && !ev.shiftKey && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
      ev.preventDefault();
      const start = ed.selectionStart,
        end = ed.selectionEnd;
      ed.setRangeText("  ", start, end, "end");
      ed.dispatchEvent(new Event("input"));
    }
    if (ev.key === "Enter" && (ev.ctrlKey || ev.metaKey)) {
      ev.preventDefault();
      runCode(holder.dataset.challenge === "true");
      return;
    }
    if (ev.key === "Enter" && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
      ev.preventDefault();
      const start = ed.selectionStart,
        end = ed.selectionEnd;
      const { text, caret } = indentOnEnter(ed.value, start, end);
      ed.setRangeText(text, start, end, "end");
      ed.selectionStart = ed.selectionEnd = start + caret;
      ed.dispatchEvent(new Event("input"));
    }
  });
}
function checkDetail(t, lang) {
  if (t.passed) return "";
  if (t.error) {
    const guide = explainError(t.error, lang);
    return `<small>${guide ? `<b>${prose(guide.summary)}</b><br>` : ""}Your code raised: ${e(t.error)}</small>`;
  }
  // "an array", "an object", "a string": every kind name that starts a vowel.
  const kind = (value) => (/^[aeiou]/.test(valueKind(value)) ? "an " : "a ") + valueKind(value);
  return `<small>Expected <code>${e(formatValue(t.expected))}</code><br>Received <code>${e(formatValue(t.actual))}</code>${
    typeMismatch(t.expected, t.actual)
      ? `<br><b>The value is right, but the type is not: expected ${kind(t.expected)}, received ${kind(t.actual)}.</b>`
      : ""
  }</small>`;
}
function outputMarkup(data, lang = "js") {
  const guide = data.error ? explainError(data.error, lang) : null;
  const results = data.results || [];
  const failed = results.filter((t) => !t.passed);
  return `${data.error ? `<div class="run-error"><strong>${guide ? prose(guide.summary) : "Something to investigate"}</strong>${guide ? `<p>${prose(guide.hint)}</p><details><summary>The exact message</summary><pre>${e(data.error)}</pre></details>` : `<pre>${e(data.error)}</pre>`}</div>` : ""}${data.logs?.length ? `<pre class="console-lines">${e(data.logs.join("\n"))}</pre>` : ""}${results.length ? `<div class="test-summary ${failed.length ? "failed" : "passed"}">${icon(failed.length ? "code" : "check", 17)} ${results.length - failed.length} / ${results.length} checks passed${failed.length ? ` · start with “${e(failed[0].label)}”` : ""}</div>${results.map((t) => `<div class="test-result ${t.passed ? "pass" : "fail"}${t === failed[0] ? " leading-fail" : ""}"><span>${t.passed ? "✓" : "×"}</span><div><strong>${e(t.label)}</strong>${checkDetail(t, lang)}</div></div>`).join("")}` : !data.error && !data.logs?.length ? '<div class="output-empty">Finished successfully.<span>Use console.log or Console.WriteLine to display a value.</span></div>' : ""}${data.warnings ? `<details class="compiler-warnings"><summary>Compiler notes</summary><pre>${e(data.warnings)}</pre></details>` : ""}`;
}
async function runCode(check = false) {
  if (runBusy) return;
  const holder = $(".editor-shell");
  if (!holder) return;
  const code = $("#code-editor").value,
    lang = holder.dataset.lang,
    key = holder.dataset.editorKey;
  const lesson = lessons.find((l) => l.id === key);
  if (hosted && lang === "cs") {
    toast("C# runs in the local edition. Open Local C# setup to continue.");
    return;
  }
  if (check && !lesson) return;
  const runTrigger = document.activeElement;
  const restoreRunFocus = holder.contains(runTrigger) && runTrigger.matches(".editor-bottom button");
  runBusy = true;
  holder
    .querySelectorAll(".editor-bottom button")
    .forEach((b) => (b.disabled = true));
  $("#code-output").innerHTML =
    `<div class="running"><forge-loader size="22" stroke="3" label="Running your code"></forge-loader>${lang === "cs" ? "Compiling and running C#…" : "Running your JavaScript…"}</div>`;
  let result;
  try {
    if (lang === "js")
      result = await new Promise((resolve) => {
        const worker = new Worker("/runner-worker.js");
        currentWorker = worker;
        const timer = setTimeout(() => {
          worker.terminate();
          resolve({
            error:
              "Execution stopped after 4 seconds. Check for an infinite loop or unresolved promise.",
            logs: [],
          });
        }, 4000);
        const finish = (data) => {
          clearTimeout(timer);
          worker.terminate();
          currentWorker = null;
          resolve(data);
        };
        worker.onmessage = (ev) => finish(ev.data);
        worker.onerror = (ev) =>
          finish({
            error: ev.message || "The JavaScript worker could not start.",
          });
        worker.postMessage({
          code,
          tests: check ? lesson.challenge.tests : [],
        });
      });
    else {
      result = await runner.run(code, check ? key : undefined);
    }
  } catch (err) {
    result = { error: err.message };
  } finally {
    runBusy = false;
    document
      .querySelectorAll(".editor-bottom button")
      .forEach((b) => (b.disabled = hosted && b.closest(".editor-shell").dataset.lang === "cs"));
    if (restoreRunFocus && runTrigger.isConnected && document.activeElement === document.body)
      focusTarget(runTrigger);
  }
  output = result;
  outputContext = key;
  if (
    check &&
    !result.error &&
    result.results?.length === lesson.challenge.tests.length &&
    result.results.every((t) => t.passed)
  ) {
    if (!state.solved.includes(key)) {
      state.solved.push(key);
      recordActivity();
      syncXpDisplay();
      toast("Challenge solved. +40 XP — well earned.");
      buddy.react("solved", { streak: streak(state.activity) });
    } else save();
  } else if (check && lesson) {
    // A check ran and did not fully pass. Ask the tutor for a specific, human
    // nudge (it names the first failing case), have the buddy speak it, and
    // unlock the matching hint tier so staged help arrives exactly when stuck.
    const total = hintTiers(lesson).length;
    const current = state.hints[key] || 0;
    const advice = await tutor.respond({
      lesson,
      results: result.results || [],
      error: result.error,
      tier: current,
      code,
    });
    const target = advice
      ? Math.min(Math.max(current + 1, advice.suggestedTier || 0), total)
      : Math.min(current + 1, total);
    if (target > current) {
      state.hints[key] = target;
      save();
    }
    if (advice) buddy.react("stuck", { message: advice.message });
  }
  if ($(".editor-shell")?.dataset.editorKey === key) {
    $("#code-output").innerHTML = outputMarkup(result, lang);
    if (lesson) {
      refreshCompletion(lesson);
      const hints = $("#lesson-hints");
      if (hints) hints.outerHTML = renderHints(lesson);
    }
  }
}
const playgroundStarters = {
  js: '// Your space to experiment. Change something. Run it again.\nconst skills = ["curiosity", "practice", "persistence"];\n\nfunction buildSomething(ingredients) {\n  return ingredients.map(skill => skill.toUpperCase());\n}\n\nconsole.log("Hello, possibility.");\nconsole.log(buildSomething(skills));\n',
  cs: '// Real C#, compiled and run with your local .NET SDK.\nvar skills = new[] { "curiosity", "practice", "persistence" };\n\nConsole.WriteLine("Hello, possibility.");\nforeach (var skill in skills)\n{\n    Console.WriteLine(skill.ToUpperInvariant());\n}\n',
};
function renderPlayground() {
  $("#main").innerHTML =
    sectionHead(
      "MAKE ROOM FOR EXPERIMENTS",
      "A blank canvas. A working mind.",
      "Try an idea, break something, follow your curiosity. Your drafts stay right here.",
    ) +
    `<div class="playground-layout"><section><div class="playground-controls"><div class="tabs"><button data-play-lang="js" class="${playLang === "js" ? "selected" : ""}">JavaScript</button><button data-play-lang="cs" class="${playLang === "cs" ? "selected" : ""}">C# / .NET</button></div><span class="runtime-label">${icon("check", 14)} ${playLang === "js" ? "Browser runtime" : hosted ? "C# runs in the local edition" : status.csharp ? "Real .NET compiler" : "SDK not available"}</span></div>${editor(playLang, "play-" + playLang, playgroundStarters[playLang])}<div class="playground-note">${icon("help", 18)}<p>${playLang === "js" ? "This is a JavaScript console, without a DOM. Top-level await is supported. Await asynchronous work before the run ends. For DOM practice, use the browser lab below." : "Write a complete console program. Common System namespaces are imported for you. Put top-level statements before class and record declarations. ASP.NET projects belong in their own project folder."}</p></div>${playLang === "js" ? `<section class="dom-lab panel"><div class="section-title"><h2>A little browser lab</h2><span class="pill">DOM + EVENTS</span></div><p>Connect an actual button to the page. This preview is isolated from your learning data.</p><label for="dom-html">HTML</label><textarea class="mini-editor" id="dom-html" spellcheck="false">${e(state.drafts["dom-html"] ?? "<h2>Make something happen.</h2>\n<button>Say hello</button>\n<output></output>")}</textarea><label for="dom-js">JavaScript</label><textarea class="mini-editor" id="dom-js" spellcheck="false">${e(state.drafts["dom-js"] ?? 'document.querySelector("button").addEventListener("click", () => {\n  document.querySelector("output").textContent = "Hello, developer!";\n});')}</textarea><button class="button primary" data-action="dom-run">${icon("play", 15)} Update preview</button><iframe title="Isolated DOM practice preview" id="dom-preview" src="/dom-preview.html" sandbox="allow-scripts"></iframe><pre id="dom-output" role="status"></pre></section>` : ""}</section><aside><div class="focus-card panel"><span class="focus-icon">${icon("coffee", 23)}</span><div class="eyebrow">ONE THING AT A TIME</div><h3>A little focus goes far.</h3><div id="focus-time" class="focus-time">${formatTime(dailyFocus(state).remaining)}</div><p>Your 25-minute session continues through refreshes and while the page is closed. Pause when you take a break.</p>${dailyFocusMarkup()}<button class="button primary" data-action="focus">${focusButtonLabel()} ${icon("play", 15)}</button><button class="text-button" data-action="focus-reset">Reset timer</button></div><div class="panel prompts-card"><h3>Follow a small question.</h3><p>What happens if the input is empty?</p><p>Can I explain each line out loud?</p><p>What is the simplest version that works?</p><p>How would I test this behavior?</p></div><a class="play-project-link" href="#projects">Ready for something bigger? ${icon("arrow", 17)}<strong>Pick a project.</strong></a></aside></div>`;
  bindEditor();
  for (const id of ["dom-html", "dom-js"])
    $("#" + id)?.addEventListener("input", (ev) => {
      state.drafts[id] = ev.target.value;
      save();
    });
}
function dailyFocusMarkup() {
  const focus = dailyFocus(state);
  return `<div class="daily-focus-progress"><div class="daily-focus-summary"><strong>Today’s focus</strong><span data-focus-today>${focusDuration(focus.seconds)} / ${state.goal} min</span></div><progress data-focus-meter max="100" value="${focus.percent}" aria-label="Today's focus goal"></progress><p data-focus-goal-status class="${focus.achieved ? "success-text" : ""}">${focus.achieved ? "Daily goal reached. Every extra minute counts." : `${focusDuration(Math.ceil(focus.remainingSeconds))} left to reach your goal.`}</p></div>`;
}
function focusButtonLabel() {
  const focus = dailyFocus(state);
  return focus.running ? "Pause session" : focus.remaining === 0 ? "Start another session"
    : focus.remaining < 1500 ? "Resume session" : "Start focus session";
}
function updateFocusDisplay(now = Date.now()) {
  const focus = dailyFocus(state, now);
  const reviewLink = $('.nav-item[href="#review"]');
  if (reviewLink) {
    const due = dueCards(false).length;
    let count = reviewLink.querySelector(".nav-count");
    if (due) {
      if (!count) {
        count = document.createElement("span");
        count.className = "nav-count";
        reviewLink.append(count);
      }
      count.textContent = due;
    } else count?.remove();
  }
  const goalLabel = $(".sidebar-tip a span");
  if (goalLabel) goalLabel.textContent = `${state.goal} min`;
  if ($("#focus-time")) $("#focus-time").textContent = formatTime(focus.remaining);
  for (const button of document.querySelectorAll('[data-action="focus"], [data-action="focus-reset"]')) {
    // Keep the focused control in the Tab order during the short save operation.
    button.setAttribute("aria-disabled", String(focusCommandBusy));
    if (button.dataset.action === "focus") button.textContent = focusButtonLabel();
  }
  for (const el of document.querySelectorAll("[data-focus-today]"))
    el.textContent = `${focusDuration(focus.seconds)} / ${state.goal} min`;
  for (const el of document.querySelectorAll("[data-focus-meter]")) {
    el.value = focus.percent;
    el.setAttribute("aria-valuetext", `${focusDuration(focus.seconds)} of ${state.goal} minutes`);
  }
  for (const el of document.querySelectorAll("[data-focus-goal-status]")) {
    el.textContent = focus.achieved ? "Daily goal reached. Every extra minute counts."
      : `${focusDuration(Math.ceil(focus.remainingSeconds))} left to reach your goal.`;
    el.classList.toggle("success-text", focus.achieved);
  }
  for (const el of document.querySelectorAll("[data-focus-lifetime]"))
    el.textContent = `${Math.floor(focus.totalSeconds / 60)} min`;
  if ($(".streak strong")) $(".streak strong").textContent = streak(state.activity);
  syncXpDisplay();
}
async function checkpointFocus(action = "tick") {
  if (focusCommandBusy || replacingProgress) return;
  focusCommandBusy = true;
  updateFocusDisplay();
  try {
    await save();
    const result = await progressStore.focus(action);
    if (result?.goalReached && result?.completed) {
      toast("Daily goal reached and focus session complete. Time for a break!");
      buddy.react("focusDone");
    } else if (result?.goalReached) {
      toast("Daily focus goal reached. Well done keeping your commitment.");
      buddy.react("focusGoal");
    } else if (result?.completed) {
      toast("Focus session complete. Stand up, stretch, and take a break.");
      buddy.react("focusDone");
    }
  } finally {
    focusCommandBusy = false;
    focusCheckpointAt = Date.now();
    updateFocusDisplay();
  }
}

function renderReview() {
  let cards = dueCards();
  if (!cards.some((l) => l.id === selectedReview?.id))
    selectedReview = cards[0];
  $("#main").innerHTML =
    sectionHead(
      "RECALL IS WHERE LEARNING STICKS",
      "Meet your future memory.",
      "Try to retrieve the answer before you reveal it. The effort is the learning.",
    ) +
    `<div class="review-toolbar"><div class="tabs"><button data-review-mode="learned" class="${!reviewAll ? "selected" : ""}">My learned concepts</button><button data-review-mode="all" class="${reviewAll ? "selected" : ""}">Explore all cards</button></div><span>${cards.length} due · ${reviewedSession} reviewed this session</span></div><div class="review-layout"><section>${selectedReview ? `<article class="flashcard"><div class="flashcard-top">${badge(selectedReview.lang)}<span>${modules[selectedReview.module]}</span><span>RECALL CARD</span></div><div class="flashcard-body"><div class="eyebrow">WITHOUT LOOKING IT UP…</div><h2>${e(selectedReview.recall.question)}</h2>${reviewRevealed ? `<div class="recall-answer">${e(selectedReview.recall.answer)}</div>` : "<p>Take a moment. Say the answer out loud, or write it down.</p>"}</div><div class="flashcard-bottom">${!reviewRevealed ? `<button class="button primary" data-action="reveal">Reveal answer ${icon("arrow", 16)}</button><span>Space to reveal</span>` : `<span>How well did you remember?</span><div class="rating-buttons"><button data-rating="again">Again<small>10 minutes</small></button><button data-rating="hard">With effort<small>${scheduleReview(state.reviews[selectedReview.id], "hard").interval} day${scheduleReview(state.reviews[selectedReview.id], "hard").interval === 1 ? "" : "s"}</small></button><button data-rating="good">Got it<small>${scheduleReview(state.reviews[selectedReview.id], "good").interval} day${scheduleReview(state.reviews[selectedReview.id], "good").interval === 1 ? "" : "s"}</small></button></div>`}</div></article><a class="review-source" href="#lesson/${selectedReview.id}">${icon("book", 16)} Revisit: ${e(selectedReview.title)} ${icon("arrow", 15)}</a>` : `<div class="empty-state panel"><div class="empty-icon">${icon("cards", 36)}</div><h2>${state.completed.length || reviewAll ? "You’re all caught up." : "Build knowledge. Then keep it."}</h2><p>${state.completed.length || reviewAll ? "Your cards will return when they’re due. Good learning includes a little space." : "Complete your first lesson to add a concept to your personal review deck. Or explore all cards for a preview."}</p>${linkButton("#lesson/" + resumeLesson().id, "Continue learning")}</div>`}</section><aside class="review-explainer panel"><span class="little-spark">✳</span><h3>A bit of forgetting is useful.</h3><p>Recalling an answer strengthens it more than simply reading it again.</p><ol><li>Attempt an answer before revealing.</li><li>Rate your actual recall, honestly.</li><li>Return when the card is due.</li></ol><div class="callout-small">Again returns in 10 minutes. With effort returns soon, then grows slowly. Got it grows the interval up to 60 days.</div></aside></div>`;
}
function renderProjects() {
  const filtered = projects.filter(
    (p) => projectFilter === "all" || p.lang === projectFilter,
  );
  $("#main").innerHTML =
    sectionHead(
      "FROM UNDERSTANDING TO OWNERSHIP",
      "Make something that matters.",
      "Six project briefs. Real requirements. A reason to bring everything together.",
    ) +
    `<div class="tabs"><button data-project-filter="all" class="${projectFilter === "all" ? "selected" : ""}">All projects</button><button data-project-filter="js" class="${projectFilter === "js" ? "selected" : ""}">JavaScript</button><button data-project-filter="cs" class="${projectFilter === "cs" ? "selected" : ""}">C# & full stack</button></div><div class="projects-grid">${filtered
      .map((p, i) => {
        const checks = state.projectChecks[p.id] || [];
        return `<a href="#project/${p.id}" class="project-card panel"><div class="project-art project-art-${projects.indexOf(p) % 3}"><span class="project-art-code">${["{ habits }", "₦ 12,500", "fetch( )", "/api/books", "recall( )", "JS ⇄ C#"][projects.indexOf(p)]}</span><span class="project-level">${p.level}</span></div><div class="project-body"><div class="project-meta">${badge(p.lang)}<span>${p.time}</span></div><h2>${p.title}</h2><p>${p.summary}</p><div class="skill-tags">${p.skills.map((s) => `<span>${s}</span>`).join("")}</div><div class="project-link"><span>${checks.length ? checks.length + " / " + p.steps.length + " milestones" : "Open project brief"}</span>${icon("arrow", 18)}</div></div></a>`;
      })
      .join("")}</div>`;
}
function renderProject(id) {
  const p = projects.find((x) => x.id === id);
  if (!p) {
    renderProjects();
    return;
  }
  const checks = state.projectChecks[id] || [];
  $("#main").innerHTML =
    `<a class="back-link" href="#projects">← All projects</a>` +
    sectionHead(
      p.level.toUpperCase() + " PROJECT · " + p.time,
      p.title,
      p.summary,
    ) +
    `<div class="project-detail-layout"><article class="panel project-brief"><h2>The brief</h2><p>${p.brief}</p><div class="skill-tags">${p.skills.map((s) => `<span>${s}</span>`).join("")}</div><h2>Build it one milestone at a time.</h2><p class="muted">Mark a milestone when you have verified the behavior in your own project.</p><div class="milestones">${p.steps.map((s, i) => `<label><input type="checkbox" data-project="${id}" data-step="${i}" ${checks.includes(i) ? "checked" : ""}><span><small>MILESTONE ${i + 1}</small>${s}</span></label>`).join("")}</div><div class="callout"><span>${icon("star", 19)}</span><div><strong>Stretch your skills</strong><p>${p.stretch}</p></div></div><h2>Watch out for</h2><p class="muted">Traps that catch people on this kind of project.</p>${(p.pitfalls || []).map((pit) => `<div class="callout"><span>${icon("bolt", 19)}</span><div><strong>${e(pit.trap)}</strong><p>${e(pit.fix)}</p></div></div>`).join("")}<h2>Your project notes</h2><textarea class="notes-input" data-note="project-${id}" aria-label="Project notes" placeholder="Decisions, questions, discoveries…">${e(state.notes["project-" + id] || "")}</textarea></article><aside><div class="panel project-launch"><div class="eyebrow">YOUR STARTING POINT</div><h3>Start small. Keep building.</h3><p>Use the playground to test a core rule, then create the full project in its own folder.</p><button class="button primary" data-project-start="${id}">Try a starting idea ${icon("arrow", 16)}</button><a href="${p.resources}" target="_blank" rel="noopener noreferrer">Read the official guide ${icon("external", 14)}</a></div>${renderRubric(p)}</aside></div>`;
}
// Projects are built in the learner's own environment, so the app cannot grade
// them. The rubric is a weighted self-assessment: rubricScore turns the checked
// criteria into a percentage measured against the project's pass line.
function rubricScoreMarkup(p, checked) {
  const { percent, passed, pass } = rubricScore(p.rubric, checked);
  return `<div class="rubric-score" id="rubric-score-${p.id}"><div class="rubric-bar"><span class="${passed ? "passed" : ""}" style="width:${percent}%"></span></div><div class="rubric-score-line"><strong>${percent}%</strong><span class="${passed ? "rubric-pass" : "rubric-keep"}">${passed ? `Passing — clears the ${pass}% bar` : `Keep going — ${pass}% to pass`}</span></div></div>`;
}
function renderRubric(p) {
  if (!p.rubric) return "";
  const checked = state.rubrics[p.id] || [];
  return `<div class="panel project-rubric"><h3>Before you call it done</h3><p class="muted">Check each criterion you can honestly demonstrate in your finished build. Your score is weighted, and this stays on this device.</p><div class="rubric-criteria">${p.rubric.criteria
    .map(
      (c, i) =>
        `<label class="rubric-item"><input type="checkbox" data-rubric="${p.id}" data-criterion="${i}" ${checked.includes(i) ? "checked" : ""}><span>${e(c.label)}<small>${c.weight} pts</small></span></label>`,
    )
    .join("")}</div>${rubricScoreMarkup(p, checked)}</div>`;
}
function renderNotebook() {
  const entries = Object.entries(state.notes).filter(([, v]) => v.trim());
  $("#main").innerHTML =
    sectionHead(
      "YOUR WORDS. YOUR UNDERSTANDING.",
      "Leave a trail of what you learn.",
      "The explanation you write yourself is often the one you remember.",
    ) +
    `<div class="notebook-layout"><section class="panel personal-notes"><div class="section-title"><h2>Your scratchpad</h2><span class="pill">AUTOSAVED</span></div><p>Ideas, questions, and things to try next.</p><textarea aria-label="Notebook scratchpad" data-note="scratchpad" class="notes-input scratchpad" placeholder="Today I learned…">${e(state.notes.scratchpad || "")}</textarea></section><section class="lesson-notes-list"><div class="section-title"><h2>From your lessons & projects</h2><span>${entries.filter(([id]) => id !== "scratchpad").length} notes</span></div>${
      entries
        .filter(([id]) => id !== "scratchpad")
        .map(([id, note]) => {
          const l = lessons.find((x) => x.id === id),
            p = projects.find((x) => "project-" + x.id === id);
          return `<a class="saved-note panel" href="${l ? "#lesson/" + id : p ? "#project/" + p.id : "#notebook"}"><small>${l ? tracks[l.lang].name : p ? "PROJECT" : "NOTE"}</small><h3>${e(l?.title || p?.title || id)}</h3><p>${e(note.slice(0, 240))}${note.length > 240 ? "…" : ""}</p><span>Continue your thinking ${icon("arrow", 14)}</span></a>`;
        })
        .join("") ||
      '<div class="panel empty-note">Your lesson notes will appear here.<br>A thought worth saving is a thought worth revisiting.</div>'
    }</section></div>`;
}
function exportNudge() {
  if (!state.completed.length && !state.solved.length && !Object.keys(state.notes).length) return "";
  if (state.lastExport && Date.now() - state.lastExport < 7 * 86400000)
    return `<p class="muted">Last backup exported ${relativeTime(state.lastExport)}.</p>`;
  return `<p class="export-nudge">${icon("help", 16)}<span>${state.lastExport
    ? `Your last backup was ${relativeTime(state.lastExport)}.`
    : "You have not exported a backup yet."} Browser storage can be cleared by the browser itself, so keep a downloaded copy of this work.</span></p>`;
}
function accountFeedback() {
  if (!syncMessage) return "";
  return `<div class="feedback retry" role="alert">${icon("help", 18)}<p>${e(syncMessage)}</p></div>`;
}
// The account section is strictly additive and appears only when a sync service
// is configured. With syncOrigin empty this returns "" and Settings is unchanged.
function accountPanel() {
  if (!sync.enabled) return "";
  const head = `<section class="panel settings-panel"><div class="settings-icon">${icon("cloud", 24)}</div>`;
  if (sync.account) {
    const last = sync.lastSynced ? `Last synced ${relativeTime(sync.lastSynced)}` : "Not yet synced on this device";
    return `${head}<h2>Your account</h2><p>Signed in as <strong>${e(sync.account.email)}</strong>. Your progress backs up to your account and merges across your devices.</p>${accountFeedback()}<div class="settings-actions"><button class="button primary" data-action="sync-now"${syncBusy ? " disabled" : ""}>${icon("refresh", 16)} Sync now</button><button class="button secondary" data-action="logout">Log out</button></div><p class="muted">${e(last)}. Logging out keeps your progress on this device and removes this account’s copy from it.</p><div class="settings-actions"><button class="button secondary" data-action="export-before-sync">Export pre-sync backup</button></div><p class="muted">The pre-sync backup is exactly what this device held before it first merged with your account.</p></section>`;
  }
  return `${head}<h2>Account &amp; cloud sync</h2><p>Optional. Create an account to back up your progress and pick up on another device. Everything keeps working on this device whether or not you sign in.</p>${accountFeedback()}<form class="account-form" id="account-form"><label>Email<input type="email" name="email" autocomplete="email" required></label><label>Password<input type="password" name="password" autocomplete="current-password" minlength="10" required></label><div class="settings-actions"><button class="button primary" type="submit" data-account-submit="signup"${syncBusy ? " disabled" : ""}>Create account</button><button class="button secondary" type="submit" data-account-submit="login"${syncBusy ? " disabled" : ""}>Log in</button></div><button type="button" class="linklike" data-action="reset-password"${syncBusy ? " disabled" : ""}>Forgot your password?</button></form><p class="muted">Use at least 10 characters. Forgot it? Enter your email above and choose “Forgot your password?” — we’ll email a link to set a new one. Your email and a securely hashed password are stored by this project’s own sync service; your theme is never uploaded.</p></section>`;
}
// The study buddy is device-local, like the theme, so its toggle and name live in
// the appearance panel — not in the exported progress record. buddy.hidden/name
// are the source of truth; this markup just reflects them.
function buddyPanel() {
  const shown = !buddy.hidden;
  return `<div class="buddy-setting"><div class="buddy-setting-row"><div><strong>Study buddy</strong><p class="muted">${e(buddy.name)} reacts as you learn and points you at the first failing check.</p></div><button class="button secondary" data-action="toggle-buddy" aria-pressed="${shown}">${shown ? "Hide" : "Show"}</button></div><form class="buddy-name" ${shown ? "" : "hidden"}><label for="buddy-name-input" class="sr-only">Buddy name</label><div class="buddy-name-row"><input id="buddy-name-input" maxlength="24" value="${e(buddy.name)}" placeholder="Name your buddy" autocomplete="off"><button class="button secondary" type="submit">Rename</button></div></form></div>`;
}
function renderSettings() {
  const pref = themePref();
  $("#main").innerHTML =
    sectionHead(
      "MAKE THIS SPACE YOURS",
      "A little setup. A steady rhythm.",
      "Your learning stays on this device. Keep a backup when you want to take it elsewhere.",
    ) +
    `<div class="settings-grid">${accountPanel()}<section class="panel settings-panel"><div class="settings-icon">${icon("moon", 24)}</div><h2>Appearance</h2><p>Choose how Forge looks on this device. System follows your operating system’s light or dark setting.</p><div class="goal-options theme-options">${[["light", "Light"], ["dark", "Dark"], ["system", "System"]].map(([value, label]) => `<button data-theme-choice="${value}" aria-pressed="${pref === value}" class="${pref === value ? "selected" : ""}">${label}</button>`).join("")}</div><p class="muted">This preference stays on this device and is never included in a progress backup.</p>${buddyPanel()}</section><section class="panel settings-panel"><div class="settings-icon">${icon("clock", 24)}</div><h2>Set your daily intention</h2><p>Choose a realistic amount of focused practice. Consistency matters more than a heroic first day.</p><div class="goal-options">${[15, 30, 60, 90].map((g) => `<button data-goal="${g}" aria-pressed="${state.goal === g}" class="${state.goal === g ? "selected" : ""}">${g}<small>min / day</small></button>`).join("")}</div>${dailyFocusMarkup()}<p class="muted">Use the 25-minute timer in the playground. Today resets at local midnight; your lifetime total stays intact. Changing the goal keeps the time logged today.</p></section><section class="panel settings-panel"><div class="settings-icon">${icon("download", 24)}</div><h2>Your progress, portable</h2><p>Back up completed lessons, quiz results, notes, code drafts, project milestones, and review schedules.</p><div class="settings-actions"><button class="button primary" data-action="export">${icon("download", 16)} Export progress</button><button class="button secondary" data-action="import">Import backup</button><input type="file" id="import-file" accept="application/json,.json" hidden></div>${exportNudge()}<p class="muted">Import replaces current progress and keeps a separate copy of the previous save. The website and the local edition keep <strong>separate</strong> progress — a backup is how work moves between them. <a href="#local-setup">How to transfer progress</a></p><div class="settings-actions"><button class="button secondary" data-action="export-recovery">Export automatic backup</button><button class="button secondary" data-action="export-before-import">Export pre-import backup</button></div><p class="muted">The automatic backup holds the previous successful save. Export it, then import that file to restore it. Backups stay in this browser; download a copy before clearing browser data.</p><div class="danger-zone"><button class="button danger" data-action="reset-progress">${icon("trash", 16)} Reset all progress</button><p class="muted">Clears completed lessons, quizzes, notes, drafts, projects, and review schedules on this device. A backup downloads first, and you will be asked to confirm. Your theme and study buddy are unaffected.</p></div></section><section class="panel settings-panel"><div class="settings-icon">${icon("terminal", 24)}</div><h2>Your local learning studio</h2><div class="runtime-info"><span>JavaScript</span><strong>Ready · isolated worker</strong><span>C# compiler</span><strong>${hosted ? "Available in the local edition" : status.csharp ? "Ready · .NET SDK " + e(status.sdk) : "Not available — install .NET SDK"}</strong><span>Account</span><strong>${sync.enabled ? "Optional" : "Not required"}</strong><span>Internet required</span><strong>${hosted ? "To load this website" : "No, except reference links"}</strong><span>Progress storage</span><strong id="storage-detail">${e(storageMessage || "This browser · automatic recovery backup")}</strong></div><p class="muted">${hosted ? "JavaScript runs in your browser. C# compilation is available in the downloadable local edition." : "C# runs with your local user’s permissions. Use code you trust."} <a href="#local-setup">Local C# setup</a></p></section><section class="panel settings-panel"><div class="settings-icon">${icon("path", 24)}</div><h2>A study rhythm that works</h2><ol class="study-rhythm"><li><strong>5 minutes</strong> Recall a previous concept before rereading.</li><li><strong>10–20 minutes</strong> Read and trace one worked example.</li><li><strong>15–30 minutes</strong> Solve a challenge without copying.</li><li><strong>5 minutes</strong> Explain what changed in your understanding.</li></ol><p class="muted">Lesson timings are estimates. Slow down when a concept deserves another pass.</p></section></div>`;
}

function syncSelectedControls() {
  for (const button of document.querySelectorAll("[data-path], [data-play-lang], [data-project-filter], [data-review-mode]"))
    button.setAttribute("aria-pressed", String(button.classList.contains("selected")));
}
function csharpNotice() {
  return `<aside class="runtime-notice"><h3>C# runs on your computer</h3><p>You can read lessons and save drafts here. Download the local edition to run C# and check solutions, then transfer progress using a backup.</p>${linkButton("#local-setup", "Set up local C#", "secondary")}</aside>`;
}
function renderLocalSetup() {
  $("#main").innerHTML = sectionHead("KEEP LEARNING IN BOTH LANGUAGES", "Run C# on your computer.", "The online edition runs JavaScript in your browser. The local edition also compiles C# with .NET.") +
    `<div class="info-page panel"><h2>1. Install the tools</h2><p>Install <a href="https://nodejs.org/en/download" target="_blank" rel="noopener noreferrer">Node.js 20 or newer</a> and the <a href="https://dotnet.microsoft.com/en-us/download/dotnet/10.0" target="_blank" rel="noopener noreferrer">.NET 10 SDK</a>. Choose the SDK, not just the runtime. Windows, macOS, and Linux are supported.</p><h2>2. Open the local edition</h2>${hosted ? '<a class="button primary" href="/downloads/forge-local.zip" download>Download local edition (.zip)</a>' : '<p>You are already using the local edition.</p>'}<p>Extract the entire ZIP. On Windows, double-click <strong>Start Forge.cmd</strong>. On macOS or Linux, open a terminal in the extracted folder and run <code>npm start</code>. Keep the terminal open and visit <a href="http://localhost:4317" target="_blank" rel="noopener noreferrer">localhost:4317</a>.</p><p>C# executes with your computer’s permissions. Run code you trust, and keep the local server private.</p><h2>3. Bring your progress with you</h2><ol><li>On this website, open <a href="#settings">Settings &amp; backups</a> and export your progress.</li><li>Import that backup in the local edition before continuing your C# lessons.</li><li>When you finish locally, export again and import on the website.</li></ol><p><strong>Import replaces the receiving edition’s progress.</strong> Export any new work there first. The two editions do not sync automatically, so finish a transfer before studying in the other edition.</p><h2>If the compiler is unavailable</h2><p>Confirm that <code>dotnet --list-sdks</code> lists the .NET 10 SDK, then restart Forge. Lessons and JavaScript remain available while you set it up.</p></div>`;
}
function renderPrivacy() {
  const accountLine = sync.enabled
    ? "Creating an account is optional; without one, nothing leaves this browser."
    : "It does not create an account or sync your learning data to a cloud database.";
  const accountSection = sync.enabled
    ? `<h2>If you create an account</h2><p>Signing in is optional and only happens when you ask. An account stores your email address, a securely hashed password (scrypt — the password itself is never stored), and the same progress record described above, on this project’s own self-hosted sync service. It is used to back up your progress and merge it across your devices. Your appearance theme stays on each device and is never uploaded. If you forget your password, you can request a reset email and set a new one. Logging out removes this account’s copy of your progress from the device.</p>`
    : "";
  // Only shown on a build wired to the hosted tutor. The offline heuristic tutor,
  // the default, sends nothing — so this disclosure appears exactly when it is true.
  const tutorSection = tutorOrigin
    ? `<h2>The AI tutor</h2><p>When a check does not pass, Forge asks a hosted AI tutor for a hint. To write one it sends the failing lesson’s code and the failing check to this project’s own tutor service, which relays it to an AI model. Passing runs send nothing, and the offline tutor always provides the hint if the service cannot be reached. Your notes, other lessons, and any account details are never sent. Do not paste anything private into code you run while the tutor is enabled.</p>`
    : "";
  $("#main").innerHTML = sectionHead("YOUR LEARNING DATA", "Privacy & storage.", "Know where your code, notes, and progress live.") +
    `<article class="info-page panel"><h2>Saved in this browser</h2><p>Forge stores completed lessons, quiz results, code drafts, notes, review schedules, project milestones, focus time, and any name you set on a completion certificate in browser storage. ${accountLine}</p>${accountSection}${tutorSection}<h2>Where code runs</h2><p>JavaScript runs in a browser worker. The DOM lab uses an isolated preview frame. On the hosted site, C# code is not submitted to a server; use the local edition to compile it on your computer.</p><h2>Backups and deletion</h2><p>Exported backups contain your notes and code as readable JSON. Keep them somewhere you trust. Clearing this site’s data in your browser deletes its progress and recovery copies. Export a backup first if you want to keep your work.</p><h2>Site requests</h2><p>Forge includes no analytics scripts, advertising trackers, or third-party fonts. Your hosting provider may retain ordinary access logs when serving the site. Official reference links open external websites with their own privacy policies.</p><h2>Addresses have separate storage</h2><p>Each domain, browser, and local port has its own save. Private browsing and browser cleanup can remove saves. Use <a href="#settings">Settings &amp; backups</a> when moving between the website and the local edition.</p></article>`;
}

function renderTerms() {
  // Plain-language terms for a free, local-first educational app. Kept honest and
  // narrow: no fees, no accounts required, code runs on the learner's own machine,
  // and the strong self-execution warning matches the security posture in
  // renderPrivacy / renderLocalSetup. Account clause appears only on a sync build.
  const accountSection = sync.enabled
    ? `<h2>Optional accounts</h2><p>An account is optional and created only when you ask. If you forget your password, you can request a reset email to set a new one; otherwise keep it somewhere safe. Do not share an account or use it to store anything you are not comfortable keeping on this project's self-hosted sync service. We may suspend an account that is used to attack, overload, or abuse the service.</p>`
    : "";
  $("#main").innerHTML = sectionHead("THE AGREEMENT", "Terms of use.", "The short, plain version of how Forge is offered and used.") +
    `<article class="info-page panel"><h2>Using Forge</h2><p>Forge Code Academy is a free tool for learning JavaScript and C#. By using it you agree to these terms. If you do not agree, please stop using it. These terms may change as Forge grows; continuing to use it after a change means you accept the updated version.</p>` +
    `<h2>What Forge is</h2><p>Forge is an educational project provided as is, for personal learning. It is not professional instruction, certification, or advice, and completing a track does not guarantee any particular skill level or outcome. Lesson content and timings are guidance, not promises.</p>` +
    `<h2>Running code is your responsibility</h2><p>The local edition compiles and runs C# with your own computer's permissions, and JavaScript runs in your browser. You are responsible for the code you write, paste, or run. Run only code you understand and trust, and keep the local server private to your machine. Forge does not review or sandbox the C# you choose to run locally.</p>` +
    accountSection +
    `<h2>Your work is yours</h2><p>The code, notes, and answers you create stay yours. The Forge name, curriculum, lesson text, and interface are the work of this project. You may use Forge for your own learning and share what you build, but please do not resell Forge itself or present its curriculum as your own.</p>` +
    `<h2>Acceptable use</h2><p>Use Forge for learning. Do not use it to break the law, to attack or overload the service or others, or to attempt to defeat the browser isolation that keeps lesson code contained. Automated bulk access and attempts to disrupt other learners are not allowed.</p>` +
    `<h2>No warranty</h2><p>Forge is offered without warranties of any kind, including fitness for a particular purpose or that it will be uninterrupted or error free. Your progress lives in your browser and in backups you export, so keep your own copies of anything important. To the fullest extent allowed by law, the project and its contributors are not liable for any loss arising from using Forge, including lost progress or anything that results from code you run.</p>` +
    `<h2>Questions</h2><p>These terms sit alongside the <a href="#privacy">Privacy &amp; storage</a> page, which explains where your data lives. For anything else, see the project's repository.</p></article>`;
}

function openSearch() {
  if ($("#search-dialog")) return;
  const returnTo = document.activeElement;
  const d = document.createElement("dialog");
  d.id = "search-dialog";
  d.setAttribute("aria-label", "Command palette");
  d.innerHTML = `<div class="search-dialog-top">${icon("search")}<label class="sr-only" for="lesson-search">Search pages and lessons</label><input id="lesson-search" placeholder="Jump to a page, run a command, or find a lesson…" autocomplete="off"><button class="icon-button" data-action="close-search" aria-label="Close command palette">${icon("close", 18)}</button></div><div id="search-results"></div><div class="search-dialog-foot">Pages, actions &amp; all 40 lessons <kbd>Esc to close</kbd></div>`;
  document.body.append(d);
  d.showModal();
  searchResults("");
  $("#lesson-search").focus();
  $("#lesson-search").addEventListener("input", (ev) =>
    searchResults(ev.target.value),
  );
  d.addEventListener("close", () => {
    d.remove();
    if (d.dataset.navigating !== "true")
      focusTarget(returnTo?.isConnected && returnTo !== document.body && !returnTo.closest("[inert]") ? returnTo : $('[data-action="search"]'));
  });
  d.addEventListener("click", (ev) => {
    if (ev.target === d) d.close();
  });
}
// The command palette (Ctrl/Cmd+K) surfaces every page and a theme action beside
// the lesson search. Navigation entries are plain hash links, so the existing
// #search-results click handler drives them; the theme entry is a <button> that
// falls through to the shared data-action dispatch. `keywords` lets a page be found
// by more than its visible label.
function paletteCommands() {
  const dark = document.documentElement.dataset.theme === "dark";
  return [
    { label: "Overview", hint: "Your learning home", href: "#overview", icon: "grid", keywords: "home dashboard start" },
    { label: "Learning paths", hint: "Browse the curriculum", href: "#paths", icon: "path", keywords: "lessons curriculum tracks modules javascript csharp" },
    { label: "Playground", hint: "A blank canvas to experiment", href: "#playground", icon: "code", keywords: "editor run sandbox repl scratch" },
    { label: "Review deck", hint: "Recall what you have learned", href: "#review", icon: "cards", keywords: "flashcards spaced repetition recall" },
    { label: "Projects", hint: "Build something real", href: "#projects", icon: "folder", keywords: "build apps portfolio" },
    { label: "Notebook", hint: "Your notes in one place", href: "#notebook", icon: "note", keywords: "notes journal snippets" },
    { label: "Settings & backups", hint: "Preferences, goal, export", href: "#settings", icon: "settings", keywords: "preferences export import backup daily goal appearance" },
    { label: "Local C# setup", hint: "Run C# on your computer", href: "#local-setup", icon: "terminal", keywords: "dotnet install download local edition compiler" },
    { label: "Privacy & storage", hint: "Where your data lives", href: "#privacy", icon: "help", keywords: "data storage privacy" },
    { label: "Terms of use", hint: "How Forge is offered", href: "#terms", icon: "note", keywords: "terms legal agreement" },
    { label: dark ? "Switch to light theme" : "Switch to dark theme", hint: "Change appearance on this device", action: "toggle-theme", icon: dark ? "sun" : "moon", keywords: "theme dark light mode appearance toggle" },
  ];
}
function searchResults(query) {
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const matches = (haystack) => terms.every((q) => haystack.toLowerCase().includes(q));
  const commands = paletteCommands().filter(
    (c) => !terms.length || matches(`${c.label} ${c.hint} ${c.keywords}`),
  );
  const found = lessons
    .filter((l) =>
      matches(
        tracks[l.lang].name +
          " " +
          l.title +
          " " +
          l.lead +
          " " +
          modules[l.module] +
          " " +
          l.sections.map((s) => s.join(" ")).join(" "),
      ),
    )
    .slice(0, 10);
  const commandRow = (c) => {
    const inner = `<span class="command-icon">${icon(c.icon, 17)}</span><span><strong>${e(c.label)}</strong><small>${e(c.hint)}</small></span>${icon("arrow", 16)}`;
    return c.href
      ? `<a class="search-result" href="${c.href}">${inner}</a>`
      : `<button type="button" class="search-result" data-action="${c.action}">${inner}</button>`;
  };
  const commandSection = commands.length
    ? `<div class="palette-group">Go to</div>${commands.map(commandRow).join("")}`
    : "";
  const lessonSection = found.length
    ? `<div class="palette-group">Lessons</div>${found
        .map(
          (l) =>
            `<a class="search-result" href="#lesson/${l.id}">${badge(l.lang)}<span><strong>${e(l.title)}${state.completed.includes(l.id) ? ' <span class="success-text">✓</span>' : ""}</strong><small>${modules[l.module]} · ${l.minutes} min</small></span>${icon("arrow", 16)}</a>`,
        )
        .join("")}`
    : "";
  $("#search-results").innerHTML =
    commandSection + lessonSection ||
    '<div class="empty-note">Nothing matches that. Try “async”, “types”, “playground”, or “theme”.</div>';
}

function certDateText(ts) {
  return new Date(Number.isFinite(ts) && ts > 0 ? ts : Date.now()).toLocaleDateString(
    undefined,
    { year: "numeric", month: "long", day: "numeric" },
  );
}
function certificateFigure(lang) {
  return certificateSvg({
    name: state.certName,
    trackName: tracks[lang].name,
    dateText: certDateText(state.certificates[lang]),
  });
}
// Serialize the same SVG to a PNG with no dependencies. The image source is a
// data: URL (allowed by the img-src CSP; a blob: URL is not), drawn onto a canvas
// at 2× for a crisp download.
async function downloadCertificatePng(lang) {
  const svg = certificateFigure(lang);
  const source = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  try {
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error("draw"));
      img.src = source;
    });
    const scale = 2;
    const canvas = document.createElement("canvas");
    canvas.width = 720 * scale;
    canvas.height = 500 * scale;
    const ctx = canvas.getContext("2d");
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0, 720, 500);
    const pngBlob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!pngBlob) throw new Error("encode");
    const url = URL.createObjectURL(pngBlob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `forge-${lang}-certificate.png`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast("Certificate image downloaded.");
  } catch {
    toast("Could not create the image on this browser. Use Print instead.");
  }
}
// A short, celebratory overlay when a lesson (or a whole track) is completed.
// Ember is the star: a big cheering mascot at the centre with a burst of embers
// flying out around it. Auto-dismisses; a click or Escape closes it early. Under
// reduced motion it collapses to a still card with the same words — no flying
// embers, no scaling. Purely presentational; progress was saved by the caller.
// If the learner has hidden Ember, the mascot is omitted but the moment still lands.
function celebrateLesson({ trackDone = false, lang } = {}, onDone) {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const langName = lang && tracks[lang] ? tracks[lang].name : "";
  const title = trackDone ? "Track complete!" : "Congratulations!";
  const sub = trackDone
    ? `You finished the whole ${e(langName)} path — every lesson, start to finish.`
    : "Lesson complete. +100 XP — one more idea made yours.";

  const count = reduce ? 0 : 18;
  let sparks = "";
  for (let i = 0; i < count; i++) {
    const angle = (360 / count) * i + (Math.random() * 18 - 9);
    const dist = 120 + Math.random() * 120;
    const delay = Math.random() * 0.25;
    const dur = 1 + Math.random() * 0.7;
    const size = 6 + Math.random() * 8;
    sparks += `<span class="celebrate-spark" style="--a:${angle.toFixed(1)}deg;--d:${dist.toFixed(0)}px;--delay:${delay.toFixed(2)}s;--dur:${dur.toFixed(2)}s;--sz:${size.toFixed(1)}px"></span>`;
  }

  const overlay = document.createElement("div");
  overlay.className = "celebrate" + (reduce ? " celebrate--reduced" : "");
  overlay.setAttribute("role", "status");
  overlay.setAttribute("aria-live", "polite");
  overlay.innerHTML =
    `<div class="celebrate-embers" aria-hidden="true">${sparks}</div>` +
    `<div class="celebrate-card">` +
      (buddy.hidden ? "" : `<div class="celebrate-ember">${emberSprite()}</div>`) +
      `<p class="celebrate-eyebrow">${trackDone ? "Path finished" : "Lesson complete"}</p>` +
      `<h2 class="celebrate-title">${title}</h2>` +
      `<p class="celebrate-sub">${sub}</p>` +
    `</div>`;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add("celebrate--in"));

  let closed = false;
  const timer = setTimeout(close, reduce ? 1400 : 2800);
  function close() {
    if (closed) return;
    closed = true;
    clearTimeout(timer);
    document.removeEventListener("keydown", onKey);
    overlay.classList.add("celebrate--out");
    overlay.classList.remove("celebrate--in");
    const finish = () => { overlay.remove(); onDone && onDone(); };
    reduce ? finish() : setTimeout(finish, 340);
  }
  function onKey(ev) { if (ev.key === "Escape") close(); }
  overlay.addEventListener("click", close);
  document.addEventListener("keydown", onKey);
}
function openCertificate(lang) {
  if (!tracks[lang] || $("#certificate-dialog")) return;
  const returnTo = document.activeElement;
  const d = document.createElement("dialog");
  d.id = "certificate-dialog";
  d.setAttribute("aria-label", `${tracks[lang].name} certificate of practice`);
  d.innerHTML =
    `<div class="certificate-frame">${certificateFigure(lang)}</div>` +
    `<form class="certificate-name" data-cert-lang="${lang}"><label for="cert-name-input">Name on the certificate</label><div class="certificate-name-row"><input id="cert-name-input" maxlength="60" value="${e(state.certName)}" placeholder="Your name" autocomplete="name"><button class="button secondary" type="submit">Save name</button></div></form>` +
    `<div class="certificate-actions"><button class="button primary" data-action="cert-print" data-lang="${lang}">${icon("book", 16)} Print</button><button class="button secondary" data-action="cert-png" data-lang="${lang}">${icon("download", 16)} Download PNG</button><button class="button secondary" data-action="close-certificate">Close</button></div>` +
    `<p class="muted certificate-note">A record of practice — not a professional credential. It lives in your progress and travels with your backups.</p>`;
  document.body.append(d);
  d.showModal();
  focusTarget($("#cert-name-input"));
  d.addEventListener("close", () => {
    d.remove();
    focusTarget(
      returnTo?.isConnected && returnTo !== document.body ? returnTo : $("#main h1"),
    );
  });
  d.addEventListener("click", (ev) => {
    if (ev.target === d) d.close();
  });
}
function refreshCertificate(lang) {
  const frame = $("#certificate-dialog .certificate-frame");
  if (frame) frame.innerHTML = certificateFigure(lang);
}

document.addEventListener("click", async (ev) => {
  const button = ev.target.closest("button,a");
  if (!button) return;
  if (button.classList.contains("skip-link")) {
    ev.preventDefault();
    $("#main").focus();
    return;
  }
  if (button.closest("#search-results")) {
    const dialog = $("#search-dialog");
    if (button.hash) {
      ev.preventDefault();
      dialog.dataset.navigating = "true";
      dialog.close();
      if (location.hash === button.hash) focusPageHeading();
      else location.hash = button.hash;
      return;
    }
    // Action commands (e.g. theme toggle) carry no hash: close the palette so
    // focus returns to the trigger, then fall through to the data-action dispatch.
    dialog.close();
  }
  if (mobileLayout.matches && button.closest("#sidebar") && button.matches('a[href^="#"]')) {
    ev.preventDefault();
    setNavigationOpen(false);
    if (location.hash === button.hash) focusPageHeading();
    else location.hash = button.hash;
    return;
  }
  const a = button.dataset.action;
  // Several controls replace their own DOM when selected; refresh their
  // accessible pressed state after the current handler finishes rendering.
  queueMicrotask(syncSelectedControls);
  if (a === "menu") setNavigationOpen(!$("#sidebar").classList.contains("mobile-open"), true);
  if (a === "close-menu") setNavigationOpen(false, true);
  if (a === "search") openSearch();
  if (a === "close-search") $("#search-dialog")?.close();
  if (a === "view-certificate") openCertificate(button.dataset.lang);
  if (a === "close-certificate") $("#certificate-dialog")?.close();
  if (a === "cert-print") window.print();
  if (a === "cert-png") await downloadCertificatePng(button.dataset.lang);
  if (a === "toggle-buddy") {
    buddy.setVisible(buddy.hidden);
    if (route === "settings") renderSettings();
    if (!buddy.hidden) buddy.react("greet");
  }
  if (a === "dismiss-welcome") {
    state.onboarded = true;
    save();
    renderOverview();
    focusPageHeading();
  }
  // The anchor navigates on its own; mark the panel done so it does not
  // reappear behind the lesson the learner just opened.
  if (a === "begin") {
    state.onboarded = true;
    save();
  }
  if (button.dataset.path) {
    pathFilter = button.dataset.path;
    renderPaths();
    focusTarget($(`[data-path="${CSS.escape(pathFilter)}"]`));
  }
  if (button.dataset.scroll) {
    const section = document.getElementById(button.dataset.scroll);
    focusTarget(section?.querySelector("h2") || section);
    section?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  }
  if (a === "run-code") runCode();
  if (a === "test-code") runCode(true);
  if (a === "clear-output") {
    output = null;
    $("#code-output").innerHTML =
      '<div class="output-empty">Output cleared.</div>';
  }
  if (a === "reset-code") {
    const holder = $(".editor-shell"),
      key = holder.dataset.editorKey;
    const draft = $("#code-editor").value;
    const starter =
      lessons.find((l) => l.id === key)?.challenge.starter ||
      playgroundStarters[holder.dataset.lang];
    if (
      draft !== starter &&
      !confirm(
        "Restore the starter code? Your current draft for this exercise will be replaced.",
      )
    )
      return;
    state.drafts[key] = starter;
    save();
    $("#code-editor").value = starter;
    $("#code-editor").dispatchEvent(new Event("input"));
    toast("Starter code restored.");
  }
  if (a === "reveal-hint") {
    const l = lessons.find((x) => x.id === button.dataset.lesson);
    if (l) {
      const total = hintTiers(l).length;
      state.hints[l.id] = Math.min((state.hints[l.id] || 0) + 1, total);
      save();
      const hints = $("#lesson-hints");
      if (hints) {
        hints.outerHTML = renderHints(l);
        focusTarget(
          $("#lesson-hints .hint-solution") ||
            $("#lesson-hints .hint-tier:last-of-type") ||
            $("#lesson-hints"),
        );
      }
    }
  }
  if (button.dataset.complete) {
    const l = lessons.find((x) => x.id === button.dataset.complete);
    if (l && canComplete(l) && !state.completed.includes(l.id)) {
      state.completed.push(l.id);
      state.reviews[l.id] = { count: 0, interval: 0, due: Date.now() };
      recordActivity();
      // Completing this lesson may finish the whole track. Stamp the earned date
      // once; existence is otherwise derived from `completed`, so it shows on
      // every device without its own sync path.
      const trackDone =
        certificateEarned(state.completed, tracks[l.lang].lessons.map((x) => x.id)) &&
        !state.certificates[l.lang];
      if (trackDone) {
        state.certificates[l.lang] = Date.now();
        save();
      }
      toast("Lesson completed. +100 XP. Your review card is ready.");
      buddy.react("complete", { streak: streak(state.activity) });
      renderLesson(l.id);
      syncResumeControl();
      syncXpDisplay();
      celebrateLesson({ trackDone, lang: l.lang }, () => {
        if (trackDone) {
          buddy.react("certificate", { lang: l.lang });
          openCertificate(l.lang);
        } else {
          focusTarget($(".completion-panel h3"));
          $("#reflect").scrollIntoView({ behavior: "smooth" });
        }
      });
    }
  }
  if (button.dataset.playLang) {
    playLang = button.dataset.playLang;
    history.replaceState(null, "", "#playground?lang=" + playLang);
    renderPlayground();
    focusTarget($(`[data-play-lang="${CSS.escape(playLang)}"]`));
  }
  if (a === "focus") await checkpointFocus(dailyFocus(state).running ? "pause" : "start");
  if (a === "focus-reset") {
    await checkpointFocus("reset");
  }
  if (a === "dom-run") {
    const previousFrame = $("#dom-preview");
    const frame = previousFrame.cloneNode(false);
    const preview = {
      type: "forge-dom",
      html: $("#dom-html").value,
      code: $("#dom-js").value,
    };
    // A fresh document also clears document/window listeners and timers
    // installed by the last experiment, not just its visible HTML.
    frame.addEventListener("load", () => {
      if (frame.isConnected) frame.contentWindow.postMessage(preview, "*");
    }, { once: true });
    $("#dom-output").textContent = "Loading preview…";
    previousFrame.replaceWith(frame);
  }
  if (button.dataset.reviewMode) {
    reviewAll = button.dataset.reviewMode === "all";
    selectedReview = null;
    reviewRevealed = false;
    renderReview();
    focusTarget($(`[data-review-mode="${CSS.escape(button.dataset.reviewMode)}"]`));
  }
  if (a === "reveal") {
    reviewRevealed = true;
    renderReview();
    focusTarget($(".recall-answer"));
  }
  if (button.dataset.rating && selectedReview && reviewRevealed) {
    state.reviews[selectedReview.id] = scheduleReview(
      state.reviews[selectedReview.id],
      button.dataset.rating,
    );
    recordActivity();
    reviewedSession++;
    selectedReview = null;
    reviewRevealed = false;
    renderReview();
    buddy.react("review");
    focusTarget($(".flashcard h2") || $("#main h1"));
  }
  if (button.dataset.projectFilter) {
    projectFilter = button.dataset.projectFilter;
    renderProjects();
    focusTarget($(`[data-project-filter="${CSS.escape(projectFilter)}"]`));
  }
  if (button.dataset.projectStart) {
    const p = projects.find((x) => x.id === button.dataset.projectStart);
    const key = "play-" + p.lang;
    if (
      state.drafts[key] &&
      state.drafts[key] !== p.starter &&
      !confirm(
        "Replace your " +
          tracks[p.lang].name +
          " playground draft with this project starter?",
      )
    )
      return;
    state.drafts[key] = p.starter;
    save();
    playLang = p.lang;
    location.hash = "playground";
  }
  if (button.dataset.goal) {
    state.goal = Number(button.dataset.goal);
    save();
    renderSettings();
    focusTarget($(`[data-goal="${state.goal}"]`));
    toast("Daily goal updated.");
  }
  if (a === "toggle-theme") {
    const pref = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    localStorage.setItem(THEME_KEY, pref);
    applyTheme(pref);
    syncThemeControls();
  }
  if (button.dataset.themeChoice) {
    const pref = button.dataset.themeChoice;
    localStorage.setItem(THEME_KEY, pref);
    applyTheme(pref);
    syncThemeControls();
    focusTarget($(`[data-theme-choice="${CSS.escape(pref)}"]`));
  }
  if (a === "export") {
    await checkpointFocus();
    state.lastExport = Date.now();
    await save();
    const blob = new Blob([JSON.stringify(state, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "forge-progress-" + dayKey() + ".json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast("Progress backup exported.");
    if (route === "settings") {
      renderSettings();
      focusTarget($('[data-action="export"]'));
    }
  }
  if (a === "import") {
    if (runBusy) { toast("Wait for the current code run to finish before importing progress."); return; }
    $("#import-file").click();
  }
  if (a === "reset-progress") {
    if (runBusy) { toast("Wait for the current code run to finish before resetting progress."); return; }
    // Never wipe without a way back: download a full backup first, then require
    // an explicit confirm before replacing the record with a fresh one.
    await checkpointFocus();
    state.lastExport = Date.now();
    await save();
    const url = URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "forge-progress-before-reset-" + dayKey() + ".json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    if (!confirm(
      "A backup just downloaded. Reset all progress on this device now? This clears completed lessons, quizzes, notes, drafts, projects, and review schedules. Import the backup to restore it.",
    )) { toast("Reset cancelled. Your progress is unchanged."); return; }
    try {
      replacingProgress = true;
      const reset = await progressStore.replace(freshState());
      replacingProgress = false;
      if (!reset) throw new Error(progressStore.problem);
      state = progressStore.state;
      shell();
      focusPageHeading();
      toast("Progress reset. Your backup is in your downloads.");
    } catch (err) {
      toast("Could not reset: " + err.message);
    } finally {
      replacingProgress = false;
    }
  }
  if (a === "retry-save") {
    await save();
    updateStorageStatus(progressStore.problem);
  }
  if (a === "export-recovery" || a === "export-before-import" || a === "export-before-sync") {
    const which = a === "export-before-import" ? "before-import" : a === "export-before-sync" ? "before-sync" : "recovery";
    const label = { recovery: "recovery", "before-import": "before-import", "before-sync": "before-sync" }[which];
    try {
      const raw = progressStore.backup(which);
      if (!raw) { toast(which === "before-sync" ? "No pre-sync backup exists on this device yet." : "No recovery copy is available yet."); return; }
      const url = URL.createObjectURL(new Blob([raw], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = "forge-" + label + "-" + dayKey() + ".json";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast("Backup exported.");
    } catch { toast("The backup copy could not be read. Export your current progress instead."); }
  }
  if (a === "reset-password") {
    // Signed-out recovery: send the email here, but the new password is set on the
    // sync service's own /update-password page (reached from the email link), since
    // only that origin can hold a Supabase recovery session. Then they sign in here.
    const form = $("#account-form");
    const email = form?.email.value.trim();
    if (!email) {
      syncMessage = "Enter your account email above first, then choose “Forgot your password?” and we’ll send a reset link.";
      if (route === "settings") renderSettings();
      return;
    }
    syncMessage = "";
    syncBusy = true;
    renderSettings();
    try {
      await sync.requestReset(email);
      // Deliberately does not confirm the address exists — same reason the service
      // won't. Anyone who has an account gets a link; anyone who doesn't sees this too.
      syncMessage = "If an account exists for that email, a reset link is on its way. Open it to set a new password, then sign in here.";
    } catch (err) {
      // A self-hosted sync service without email support answers 404 here. Say so
      // plainly instead of leaking its "Not found." — the learner still has export.
      syncMessage = err?.status === 404
        ? "This sync service can’t email a reset link. Keep your password safe, and keep an exported backup so your progress is never tied to it alone."
        : err?.message || "Could not send a reset link right now. Your progress is saved on this device.";
    } finally {
      syncBusy = false;
      if (route === "settings") renderSettings();
    }
    return;
  }
  if (a === "sync-now") {
    syncMessage = "";
    syncBusy = true;
    renderSettings();
    try {
      await sync.syncNow();
      syncMessage = "";
    } catch (err) {
      syncMessage = err?.message || "Sync could not complete. Your progress is saved on this device.";
    } finally {
      syncBusy = false;
      if (route === "settings") renderSettings();
    }
  }
  if (a === "logout") {
    syncMessage = "";
    try { await sync.logout(); } catch { /* Signed out locally regardless. */ }
    if (route === "settings") renderSettings();
    refreshProfile();
  }
});
async function submitAccount(mode, form) {
  const email = form.email.value.trim();
  const password = form.password.value;
  syncMessage = "";
  syncBusy = true;
  renderSettings();
  try {
    const result = mode === "signup"
      ? await sync.signup(email, password, state)
      : await sync.login(email, password);
    // Signup with email confirmation on: no session yet. Tell the learner to
    // confirm, then sign in. Their progress stays saved on this device meanwhile.
    syncMessage = result && result.pending
      ? "Almost there — check your email to confirm your account, then sign in. Your progress is saved on this device."
      : "";
  } catch (err) {
    syncMessage = err?.message || "That did not work. Check your email and password and try again.";
  } finally {
    syncBusy = false;
    if (route === "settings") renderSettings();
    refreshProfile();
  }
}
document.addEventListener("input", (ev) => {
  if (ev.target.dataset.note) {
    state.notes[ev.target.dataset.note] = ev.target.value;
    save();
  }
});
document.addEventListener("change", async (ev) => {
  const el = ev.target;
  if (el.dataset.project) {
    const id = el.dataset.project,
      step = Number(el.dataset.step);
    const set = new Set(state.projectChecks[id] || []);
    el.checked ? set.add(step) : set.delete(step);
    state.projectChecks[id] = [...set];
    save();
  }
  if (el.dataset.rubric) {
    const id = el.dataset.rubric,
      index = Number(el.dataset.criterion);
    const set = new Set(state.rubrics[id] || []);
    el.checked ? set.add(index) : set.delete(index);
    state.rubrics[id] = [...set];
    save();
    const p = projects.find((x) => x.id === id);
    const score = $(`#rubric-score-${id}`);
    if (p && score) score.outerHTML = rubricScoreMarkup(p, state.rubrics[id]);
  }
  if (el.id === "import-file") {
    const file = el.files[0];
    if (!file) return;
    try {
      if (file.size > 5e6) throw new Error("Backup exceeds the 5 MB limit.");
      const imported = validateProgress(JSON.parse(await file.text()));
      if (
        !confirm(
          "Replace your current progress with this backup? Export your current progress first if you want to keep it.",
        )
      )
        return;
      replacingProgress = true;
      const restored = await progressStore.replace(imported);
      replacingProgress = false;
      if (!restored) throw new Error(progressStore.problem);
      state = progressStore.state;
      shell();
      focusPageHeading();
      toast("Progress restored from your backup.");
    } catch (err) {
      toast("Could not import: " + err.message);
    } finally {
      replacingProgress = false;
      el.value = "";
    }
  }
});
document.addEventListener("submit", (ev) => {
  if (ev.target.id === "account-form") {
    ev.preventDefault();
    const mode = ev.submitter?.dataset.accountSubmit === "login" ? "login" : "signup";
    submitAccount(mode, ev.target);
    return;
  }
  if (ev.target.classList.contains("buddy-name")) {
    ev.preventDefault();
    const next = buddy.rename(ev.target.querySelector("#buddy-name-input").value);
    if (route === "settings") renderSettings();
    buddy.say(`Call me ${next} from now on.`, "cheer");
    return;
  }
  if (ev.target.classList.contains("certificate-name")) {
    ev.preventDefault();
    const lang = ev.target.dataset.certLang;
    const next = ev.target.querySelector("#cert-name-input").value.trim().slice(0, 60);
    if (next !== state.certName) {
      state.certName = next;
      save();
    }
    refreshCertificate(lang);
    toast(next ? "Name saved to your certificate." : "Certificate name cleared.");
    return;
  }
  if (ev.target.id !== "quiz-form") return;
  ev.preventDefault();
  const l = lessons.find((x) => x.id === ev.target.dataset.lesson),
    answer = Number(new FormData(ev.target).get("answer"));
  const correct = answer === l.quiz.answer;
  if (correct && !state.quizzes[l.id]) {
    state.quizzes[l.id] = true;
    recordActivity();
    syncXpDisplay();
    toast("Concept checked. +10 XP.");
    buddy.react("quiz");
  }
  $("#quiz-feedback").innerHTML =
    `<div class="feedback ${correct ? "success" : "retry"}">${icon(correct ? "check" : "help")}<p><strong>${correct ? "That’s it." : "Not quite. Trace the rule again."}</strong> ${e(l.quiz.why)}</p></div>`;
  refreshCompletion(l);
});
document.addEventListener("keydown", (ev) => {
  if (ev.defaultPrevented || ev.isComposing) return;
  if (ev.key === "Escape" && !$("#search-dialog") && $("#sidebar")?.classList.contains("mobile-open")) {
    ev.preventDefault();
    setNavigationOpen(false, true);
    return;
  }
  if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "k") {
    ev.preventDefault();
    openSearch();
  }
  if (
    ev.code === "Space" &&
    route === "review" &&
    !reviewRevealed &&
    selectedReview &&
    !document.activeElement.matches("input, textarea, button, a, select, summary, [contenteditable]") &&
    !$("#search-dialog")
  ) {
    ev.preventDefault();
    reviewRevealed = true;
    renderReview();
    focusTarget($(".recall-answer"));
  }
});
window.addEventListener("message", (ev) => {
  if (
    ev.source !== $("#dom-preview")?.contentWindow ||
    ev.data?.type !== "forge-dom-output"
  )
    return;
  $("#dom-output").textContent = ev.data.message;
});
window.addEventListener("hashchange", () => {
  reviewRevealed = false;
  shell();
  focusPageHeading();
});
document.addEventListener("focusin", (event) => {
  if (mobileLayout.matches && $("#sidebar")?.classList.contains("mobile-open") &&
      !$("#sidebar").contains(event.target) && !event.target.closest('[data-action="menu"]'))
    setNavigationOpen(false);
});
document.addEventListener("pointerdown", (event) => {
  if (mobileLayout.matches && $("#sidebar")?.classList.contains("mobile-open") &&
      !$("#sidebar").contains(event.target) && !event.target.closest('[data-action="menu"]'))
    setNavigationOpen(false);
});
window.addEventListener("storage", (event) => {
  if (event.key === STORAGE_KEY || event.key === null) {
    save();
    progressStore.sync();
  }
});
window.addEventListener("focus", () => { save(); progressStore.sync(); });
document.addEventListener("visibilitychange", () => {
  save();
  checkpointFocus();
  // A tab going to the background may not come back. Push a keepalive sync now
  // rather than waiting on the debounce that a hidden tab may never reach.
  if (document.visibilityState === "hidden") sync.flush();
});
window.addEventListener("beforeunload", (event) => {
  save();
  if (progressStore.unsaved) {
    event.preventDefault();
    event.returnValue = "";
  }
});
shell();
checkpointFocus();
setInterval(() => {
  updateFocusDisplay();
  updateStorageStatus();
  if (state.focusTimer.accountedAt !== null &&
      (Date.now() - focusCheckpointAt >= 15000 || dailyFocus(state).remaining === 0)) checkpointFocus();
}, 1000);
if (!hosted) runner.getStatus().catch(() => {});
// One request at boot to see whether the session cookie still names an account.
// Disabled (no sync service) makes this a no-op with no network call at all.
sync.restore().catch(() => {});
