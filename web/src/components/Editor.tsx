"use client";

// The code editor: a transparent <textarea> over a syntax-highlighted <pre>, the
// same zero-dependency technique the vanilla studio uses (see styles.css
// .editor-area). Highlighting and Enter/Tab indentation come from core.js so the
// React editor and the legacy editor behave identically. Every metric in
// Editor.module.css that affects glyph position MUST match between the two layers
// or the coloured text drifts from the caret.
import { useRef, type KeyboardEvent } from "react";
import { highlight, indentOnEnter } from "@/lib/progress/core";
import type { Lang } from "@/lib/curriculum";
import styles from "./Editor.module.css";

interface EditorProps {
  value: string;
  onChange: (value: string) => void;
  lang: Lang;
  ariaLabel?: string;
  readOnly?: boolean;
  minHeight?: number;
}

export function Editor({
  value,
  onChange,
  lang,
  ariaLabel = "Code editor",
  readOnly = false,
  minHeight = 240,
}: EditorProps) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const preRef = useRef<HTMLPreElement>(null);

  function syncScroll() {
    if (preRef.current && taRef.current) {
      preRef.current.scrollTop = taRef.current.scrollTop;
      preRef.current.scrollLeft = taRef.current.scrollLeft;
    }
  }

  function replaceSelection(text: string, caret: number) {
    const ta = taRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    onChange(ta.value.slice(0, start) + text + ta.value.slice(end));
    // Restore the caret after React commits the new value.
    requestAnimationFrame(() => {
      ta.selectionStart = ta.selectionEnd = start + caret;
    });
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (readOnly) return;
    const ta = e.currentTarget;
    if (e.key === "Enter") {
      e.preventDefault();
      const { text, caret } = indentOnEnter(ta.value, ta.selectionStart, ta.selectionEnd);
      replaceSelection(text, caret);
    } else if (e.key === "Tab") {
      e.preventDefault();
      replaceSelection("  ", 2);
    }
  }

  // A trailing newline leaves an empty final line the highlighter emits nothing
  // for; a trailing space keeps that line's height so the caret has somewhere to sit.
  const overlay = highlight(value, lang) + (value.endsWith("\n") ? " " : "");

  return (
    <div className={styles.editor} style={{ minHeight }}>
      <pre className={styles.highlight} aria-hidden="true" ref={preRef}>
        <code dangerouslySetInnerHTML={{ __html: overlay }} />
      </pre>
      <textarea
        ref={taRef}
        className={styles.textarea}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onScroll={syncScroll}
        spellCheck={false}
        autoComplete="off"
        autoCapitalize="off"
        autoCorrect="off"
        wrap="off"
        aria-label={ariaLabel}
        readOnly={readOnly}
      />
    </div>
  );
}
