import styles from "./loaders.module.css";

type Variant = "ember" | "anvil" | "molten";

type Props = {
  /** Which signature mark to animate. "ember" is the primary brand loader. */
  variant?: Variant;
  /** Pixel size of the square stage. Default 72. */
  size?: number;
  /** Accessible status text, announced to screen readers. */
  label?: string;
  className?: string;
};

/**
 * The Forge signature loader. SVG + CSS only (no gradients, so it is safe to
 * render many times without id collisions and needs no client JS). Reads the
 * live --accent tokens, so it is correct in both themes and honours
 * prefers-reduced-motion via the stylesheet. Announced as role="status".
 */
export function ForgeLoader({ variant = "ember", size = 72, label = "Loading…", className }: Props) {
  return (
    <span
      className={`${styles.stage}${className ? ` ${className}` : ""}`}
      style={{ ["--ldr-size" as string]: `${size}px` }}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      {variant === "ember" && <EmberMark />}
      {variant === "anvil" && <AnvilMark />}
      {variant === "molten" && <MoltenMark />}
      <span className="sr-only">{label}</span>
    </span>
  );
}

function EmberMark() {
  return (
    <svg viewBox="0 0 48 60" aria-hidden="true">
      <path className={styles.emberFlame} d="M18 56c-4-6 1-11 3.5-14C25 38 25 32 22 27c7 3 12 9 12 16a12 12 0 0 1-23 7Z" />
      <circle className={styles.spark} cx="30" cy="30" r="1.6" />
      <circle className={styles.spark} cx="20" cy="26" r="1.3" />
      <circle className={styles.spark} cx="34" cy="22" r="1.4" />
      <circle className={styles.spark} cx="24" cy="18" r="1.2" />
      <circle className={styles.spark} cx="14" cy="24" r="1.3" />
      <circle className={styles.spark} cx="28" cy="14" r="1.1" />
    </svg>
  );
}

function AnvilMark() {
  return (
    <svg viewBox="0 0 72 64" aria-hidden="true">
      <path d="M14 44h40l-5 8H19z" fill="var(--muted)" opacity="0.45" />
      <path d="M20 32h32c0 6-6 8-10 8H30c-6 0-10-3-10-8z" fill="var(--text)" opacity="0.5" />
      <path className={styles.stamp} d="M35 32c-2-3 .5-5 1.6-6.5C38 23 38 21 37 19c3.4 1.3 5.6 4 5.6 7a6 6 0 0 1-7.6 6Z" />
      <g className={styles.burst} fill="none" strokeLinecap="round">
        <line x1="36" y1="20" x2="36" y2="12" />
        <line x1="30" y1="22" x2="26" y2="16" />
        <line x1="42" y1="22" x2="46" y2="16" />
        <line x1="26" y1="26" x2="19" y2="24" />
        <line x1="46" y1="26" x2="53" y2="24" />
      </g>
      <g className={styles.hammer}>
        <rect x="44" y="4" width="18" height="9" rx="2" fill="var(--accent)" />
        <rect x="50" y="12" width="4" height="22" rx="2" fill="var(--muted)" />
      </g>
    </svg>
  );
}

function MoltenMark() {
  return (
    <svg viewBox="0 0 72 72" aria-hidden="true">
      <circle className={styles.ringTrack} cx="36" cy="36" r="26" />
      <circle className={styles.ring} cx="36" cy="36" r="26" />
      <path className={styles.ringCore} d="M33 46c-3-4 .6-7 2-9C37 35 37 31 35 28c5 2 8 6 8 10a8 8 0 0 1-10 8Z" />
    </svg>
  );
}

export default ForgeLoader;
