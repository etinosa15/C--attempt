"use client";

import Link from "next/link";
import { BrandMark } from "@/components/Icon";

// App-wide error boundary (forge-fix 1D): a crash shows this friendly fallback
// with a retry + a way out, never a blank page. Renders inside the root layout.
export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main
      style={{
        minHeight: "70dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "1rem",
        padding: "3rem 1.5rem",
        textAlign: "center",
      }}
    >
      <BrandMark size={34} />
      <h1 style={{ margin: 0, fontSize: "clamp(1.6rem, 5vw, 2.3rem)" }}>Something went wrong</h1>
      <p style={{ margin: 0, color: "var(--muted)", maxWidth: "44ch", lineHeight: 1.6 }}>
        An unexpected error interrupted the page. Your progress is saved on your device — nothing
        was lost. Try again, or head back to the studio.
      </p>
      <div style={{ display: "flex", gap: "0.8rem", flexWrap: "wrap", justifyContent: "center" }}>
        <button
          type="button"
          onClick={reset}
          style={{
            padding: "0.7rem 1.2rem",
            borderRadius: "10px",
            background: "var(--accent)",
            color: "var(--accent-ink)",
            fontWeight: 700,
            border: "none",
            cursor: "pointer",
          }}
        >
          Try again
        </button>
        <Link
          href="/learn"
          style={{
            padding: "0.7rem 1.2rem",
            borderRadius: "10px",
            border: "1px solid var(--line-strong)",
            color: "inherit",
            fontWeight: 700,
          }}
        >
          Open the studio
        </Link>
      </div>
    </main>
  );
}
