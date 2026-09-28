"use client";

// Command palette (Ctrl/Cmd+K) — the React re-shell of the vanilla studio's
// openSearch (public/app.js). It surfaces every page, a theme-toggle action, and
// a fuzzy search across all 40 lessons, driving navigation through the Next
// router. Built on a native <dialog> (showModal) so the focus trap, backdrop and
// Escape-to-close come for free; arrow keys move the highlight, Enter activates.
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useProgress } from "@/lib/progress/useProgress";
import { lessons, tracks, modules } from "@/lib/curriculum";
import { applyThemePref, readThemePref, resolveTheme } from "@/lib/theme";
import styles from "./learn.module.css";

type Command = {
  label: string;
  hint: string;
  href?: string;
  run?: () => void;
  keywords: string;
};
type Lesson = (typeof lessons)[number];
type Row =
  | { kind: "command"; command: Command }
  | { kind: "lesson"; lesson: Lesson };

// Page destinations, in the same order as the vanilla palette. `keywords` lets a
// page be found by more than its visible label.
const PAGES: Command[] = [
  { label: "Overview", hint: "Your learning home", href: "/learn", keywords: "home dashboard start" },
  { label: "Learning paths", hint: "Browse the curriculum", href: "/learn/paths", keywords: "lessons curriculum tracks modules javascript csharp" },
  { label: "Playground", hint: "A blank canvas to experiment", href: "/learn/playground", keywords: "editor run sandbox repl scratch" },
  { label: "Review deck", hint: "Recall what you have learned", href: "/learn/review", keywords: "flashcards spaced repetition recall" },
  { label: "Projects", hint: "Build something real", href: "/learn/projects", keywords: "build apps portfolio" },
  { label: "Notebook", hint: "Your notes in one place", href: "/learn/notebook", keywords: "notes journal snippets" },
  { label: "Settings & backups", hint: "Preferences, goal, export", href: "/learn/settings", keywords: "preferences export import backup daily goal appearance" },
  { label: "Local C# setup", hint: "Run C# on your computer", href: "/local-setup", keywords: "dotnet install download local edition compiler" },
  { label: "Privacy & storage", hint: "Where your data lives", href: "/privacy", keywords: "data storage privacy" },
  { label: "Terms of use", hint: "How Forge is offered", href: "/terms", keywords: "terms legal agreement" },
];

// Every whitespace-separated term must appear somewhere in the haystack.
function matcher(query: string) {
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return (haystack: string) => terms.every((t) => haystack.toLowerCase().includes(t));
}

export function CommandPalette() {
  const router = useRouter();
  const { state } = useProgress();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [dark, setDark] = useState(false);

  const done = useMemo(() => new Set(state.completed ?? []), [state.completed]);

  // Open on Ctrl/Cmd+K from anywhere in the learning surface.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Drive the native <dialog> from React state: showModal() gives us the focus
  // trap, backdrop and Escape handling for free. Reset the query and re-read the
  // (device-local) theme each time it opens.
  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open && !d.open) {
      setQuery("");
      setActive(0);
      setDark(resolveTheme(readThemePref()) === "dark");
      d.showModal();
      inputRef.current?.focus();
    } else if (!open && d.open) {
      d.close();
    }
  }, [open]);

  // A theme toggle lives among the commands, mirroring the vanilla palette; its
  // label flips with the resolved theme and it leaves the palette open.
  const themeCommand: Command = {
    label: dark ? "Switch to light theme" : "Switch to dark theme",
    hint: "Change appearance on this device",
    keywords: "theme dark light mode appearance toggle switch",
    run: () => {
      const next = dark ? "light" : "dark";
      applyThemePref(next);
      setDark(next === "dark");
    },
  };

  const match = matcher(query);
  const hasQuery = query.trim().length > 0;
  const commands = [...PAGES, themeCommand].filter(
    (c) => !hasQuery || match(`${c.label} ${c.hint} ${c.keywords}`),
  );
  const found = lessons
    .filter((l) =>
      match(
        `${tracks[l.lang].name} ${l.title} ${l.lead} ${modules[l.module]} ${l.sections
          .map((s) => s.join(" "))
          .join(" ")}`,
      ),
    )
    .slice(0, 10);

  const rows: Row[] = [
    ...commands.map((command) => ({ kind: "command" as const, command })),
    ...found.map((lesson) => ({ kind: "lesson" as const, lesson })),
  ];

  // Keep the highlight in range as the result set narrows, and scroll it into
  // view so keyboard navigation never runs off the visible list.
  useEffect(() => {
    setActive((a) => (rows.length ? Math.min(a, rows.length - 1) : 0));
  }, [rows.length]);
  useEffect(() => {
    resultsRef.current
      ?.querySelector<HTMLElement>(`[data-idx="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function activate(row: Row) {
    if (row.kind === "lesson") {
      setOpen(false);
      router.push(`/learn/lesson/${row.lesson.id}`);
    } else if (row.command.href) {
      setOpen(false);
      router.push(row.command.href);
    } else {
      row.command.run?.();
    }
  }

  function onInputKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, rows.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (rows[active]) activate(rows[active]);
    }
  }

  return (
    <>
      <button
        type="button"
        className={styles.searchTrigger}
        onClick={() => setOpen(true)}
        aria-label="Search pages and lessons"
        aria-keyshortcuts="Control+K Meta+K"
      >
        <span className={styles.searchTriggerIcon} aria-hidden="true">
          ⌕
        </span>
        <span className={styles.searchTriggerLabel}>Find a lesson</span>
        <kbd className={styles.searchTriggerKbd}>Ctrl K</kbd>
      </button>

      <dialog
        ref={dialogRef}
        className={styles.palette}
        aria-label="Command palette"
        onClose={() => setOpen(false)}
        onClick={(e) => {
          if (e.target === dialogRef.current) setOpen(false);
        }}
      >
        <div className={styles.paletteInner}>
          <div className={styles.paletteTop}>
            <span className={styles.paletteTopIcon} aria-hidden="true">
              ⌕
            </span>
            <input
              ref={inputRef}
              className={styles.paletteInput}
              placeholder="Jump to a page, run a command, or find a lesson…"
              autoComplete="off"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={onInputKey}
              aria-label="Search pages and lessons"
            />
          </div>

          <div ref={resultsRef} className={styles.paletteResults}>
            {rows.length === 0 && (
              <p className={styles.paletteEmpty}>
                Nothing matches that. Try “async”, “types”, “playground”, or
                “theme”.
              </p>
            )}

            {commands.length > 0 && (
              <p className={styles.paletteGroup}>Go to</p>
            )}
            {commands.map((command, i) => (
              <button
                key={`cmd-${command.label}`}
                type="button"
                data-idx={i}
                className={`${styles.paletteRow} ${i === active ? styles.paletteRowActive : ""}`}
                onClick={() => activate({ kind: "command", command })}
                onMouseMove={() => setActive(i)}
              >
                <span className={styles.paletteRowBody}>
                  <strong>{command.label}</strong>
                  <small>{command.hint}</small>
                </span>
              </button>
            ))}

            {found.length > 0 && (
              <p className={styles.paletteGroup}>Lessons</p>
            )}
            {found.map((lesson, j) => {
              const idx = commands.length + j;
              return (
                <button
                  key={lesson.id}
                  type="button"
                  data-idx={idx}
                  className={`${styles.paletteRow} ${idx === active ? styles.paletteRowActive : ""}`}
                  onClick={() => activate({ kind: "lesson", lesson })}
                  onMouseMove={() => setActive(idx)}
                >
                  <span
                    className={styles.paletteBadge}
                    data-lang={lesson.lang}
                  >
                    {lesson.lang === "cs" ? "C#" : "JS"}
                  </span>
                  <span className={styles.paletteRowBody}>
                    <strong>
                      {lesson.title}
                      {done.has(lesson.id) && (
                        <span className={styles.paletteCheck} aria-label="Completed">
                          {" "}
                          ✓
                        </span>
                      )}
                    </strong>
                    <small>
                      {modules[lesson.module]} · {lesson.minutes} min
                    </small>
                  </span>
                </button>
              );
            })}
          </div>

          <p className={styles.paletteFoot}>
            Pages, actions &amp; all {lessons.length} lessons
            <kbd>Esc</kbd>
          </p>
        </div>
      </dialog>
    </>
  );
}
