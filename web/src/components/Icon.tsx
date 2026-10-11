import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";

type IconProps = {
  /** A Font Awesome Free icon definition (solid or brands). */
  icon: IconDefinition;
  /** When set, the icon is meaningful: rendered as role="img" with this label.
      When omitted, it is decorative and hidden from assistive tech. */
  label?: string;
  /** Any CSS length; defaults to 1em so it tracks the surrounding font size. */
  size?: string | number;
  className?: string;
};

/**
 * Renders a Font Awesome icon as an inline SVG from its path data — no
 * react-fontawesome, no global CSS injection, no FOUC. SSR-safe and
 * framework-version-agnostic. One consistent set across the app (replaces the
 * old Unicode glyphs + ad-hoc marks).
 */
export function Icon({ icon, label, size = "1em", className }: IconProps) {
  const [width, height, , , path] = icon.icon;
  const d = Array.isArray(path) ? path.join(" ") : path;
  return (
    <svg
      className={className}
      viewBox={`0 0 ${width} ${height}`}
      width={size}
      height={size}
      fill="currentColor"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
      style={{ display: "inline-block", verticalAlign: "-0.125em", flex: "none" }}
    >
      <path d={d} />
    </svg>
  );
}

/** The Forge flame — the real brand mark, in the accent colour. Decorative. */
export function BrandMark({ size = 22, className }: { size?: number; className?: string }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      style={{ flex: "none" }}
    >
      <path
        d="M9 20c-2.4-3.5.6-6.5 2-8.5C12.5 9.5 12.5 7 11 5c4 1.5 6.5 4.5 6.5 8a7 7 0 0 1-8.5 7Z"
        fill="var(--accent)"
      />
    </svg>
  );
}

export default Icon;
