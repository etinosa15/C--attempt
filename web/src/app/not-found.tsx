import Link from "next/link";
import { BrandMark } from "@/components/Icon";

// Friendly 404 with a way home and into the studio (forge-fix 1D).
export default function NotFound() {
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
      <h1 style={{ margin: 0, fontSize: "clamp(1.8rem, 5vw, 2.6rem)" }}>Page not found</h1>
      <p style={{ margin: 0, color: "var(--muted)", maxWidth: "42ch", lineHeight: 1.6 }}>
        The page you were after moved or never existed. No lost progress — your work is safe
        on your device.
      </p>
      <div style={{ display: "flex", gap: "0.8rem", flexWrap: "wrap", justifyContent: "center" }}>
        <Link
          href="/"
          style={{
            padding: "0.7rem 1.2rem",
            borderRadius: "10px",
            background: "var(--accent)",
            color: "var(--accent-ink)",
            fontWeight: 700,
          }}
        >
          Back home
        </Link>
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
