import type { CSSProperties } from "react";

// Next 16's CSS pipeline (Turbopack) strips `backdrop-filter` from stylesheets,
// so the frosted-glass blur is applied inline where it must render. The glass
// background, border and inset highlight stay in CSS via the --glass-* tokens;
// only the blur lives here. Thick frost (24px) for a substantial glass material.
export const glassBlur: CSSProperties = {
  backdropFilter: "blur(24px) saturate(1.6)",
  WebkitBackdropFilter: "blur(24px) saturate(1.6)",
} as CSSProperties;
