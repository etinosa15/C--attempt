"use client";

// Copies raw text to the clipboard and briefly confirms with "Copied".
import { useState } from "react";

export function CopyButton({ text, className }: { text: string; className?: string }) {
  const [done, setDone] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      setTimeout(() => setDone(false), 1600);
    } catch {
      // Clipboard blocked (insecure context or denied); nothing to do.
    }
  }
  return (
    <button type="button" className={className} onClick={copy} aria-label={done ? "Copied" : "Copy code"}>
      {done ? "Copied" : "Copy"}
    </button>
  );
}
