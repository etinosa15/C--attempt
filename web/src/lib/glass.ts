import type { CSSProperties } from "react";

// Next 16's CSS pipeline (Turbopack) strips `backdrop-filter` from stylesheets,
// so the frosted-glass blur is applied inline where it must render. The glass
// background, border and inset highlight stay in CSS via the --glass-* tokens;
// only the blur lives here.
export const glassBlur: CSSProperties = {
  backdropFilter: "blur(14px) saturate(1.4)",
  WebkitBackdropFilter: "blur(14px) saturate(1.4)",
} as CSSProperties;
