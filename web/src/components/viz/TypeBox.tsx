"use client";

import { Icon } from "@/components/Icon";
import { faCheck, faXmark } from "@fortawesome/free-solid-svg-icons";
import styles from "./viz.module.css";

type Attempt = {
  code: string;
  ok: boolean;
  reason: string;
};

type Props = {
  title?: string;
  /** The declaration that sets the contract, e.g. `int count = 3;`. */
  declaration: string;
  attempts: Attempt[];
};

/**
 * "Types are a contract" — shows a typed declaration, then assignment attempts
 * that either honour the contract (✓) or break it (✗), each with a reason. Static
 * and keyboard-free; it is a labelled list, not a stepper.
 */
export function TypeBox({ title, declaration, attempts }: Props) {
  return (
    <figure className={styles.typeBox} role="group" aria-label={title ?? "Type contract"}>
      {title && <figcaption className={styles.vizTitle}>{title}</figcaption>}
      <pre className={styles.contractDecl}>{declaration}</pre>
      <ul className={styles.attempts}>
        {attempts.map((a, i) => (
          <li key={i} className={`${styles.attempt} ${a.ok ? styles.attemptOk : styles.attemptBad}`}>
            <span className={styles.attemptMark} aria-hidden="true">
              <Icon icon={a.ok ? faCheck : faXmark} />
            </span>
            <code className={styles.attemptCode}>{a.code}</code>
            <span className={styles.attemptReason}>
              <span className="sr-only">{a.ok ? "Allowed: " : "Rejected: "}</span>
              {a.reason}
            </span>
          </li>
        ))}
      </ul>
    </figure>
  );
}
