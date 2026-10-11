import styles from "./loaders.module.css";

type Props = {
  /** Pixel diameter. Default 15 (fits inside a button line). */
  size?: number;
  /** Accessible status text. Omit `label` for a purely decorative spinner. */
  label?: string;
  className?: string;
};

/**
 * Tiny inline spinner for Run / Save / Sync button states. Inherits
 * `currentColor`, so it matches whatever text colour the button uses. When a
 * `label` is given it announces as role="status"; otherwise it is aria-hidden.
 */
export function Spinner({ size = 15, label, className }: Props) {
  return (
    <span
      className={`${styles.spinner}${className ? ` ${className}` : ""}`}
      style={{ ["--spin-size" as string]: `${size}px` }}
      role={label ? "status" : undefined}
      aria-hidden={label ? undefined : true}
    >
      {label ? <span className="sr-only">{label}</span> : null}
    </span>
  );
}

export default Spinner;
