"use client";

// The certificate dialog — the React re-shell of the vanilla studio's
// openCertificate (public/app.js). A native <dialog> (focus trap + Escape for
// free) showing the earned certificate, an optional name that travels with the
// synced progress record, and Print / Download PNG actions. Opened from the
// Overview when a track reaches 100%.
import { useEffect, useRef, useState } from "react";
import { useProgress } from "@/lib/progress/useProgress";
import { tracks, type Lang } from "@/lib/curriculum";
import { certificateFigure, downloadCertificatePng } from "@/lib/certificate";
import styles from "./CertificateDialog.module.css";

export function CertificateDialog({ lang, onClose }: { lang: Lang; onClose: () => void }) {
  const { state, update } = useProgress();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState(state.certName ?? "");
  const [note, setNote] = useState("");

  // Open modally on mount; route a native close (Escape, backdrop) back to the parent.
  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (!d.open) d.showModal();
    const onCloseEvent = () => onClose();
    d.addEventListener("close", onCloseEvent);
    return () => d.removeEventListener("close", onCloseEvent);
  }, [onClose]);

  // Live preview reflects what's being typed; Save persists it to certName.
  const svg = certificateFigure(state, lang, name);

  function saveName() {
    const next = name.trim().slice(0, 60);
    if (next !== state.certName) update((prev) => ({ ...prev, certName: next }));
    setName(next);
    setNote(next ? "Name saved to your certificate." : "Certificate name cleared.");
  }
  async function downloadPng() {
    const ok = await downloadCertificatePng(svg, lang);
    setNote(
      ok
        ? "Certificate image downloaded."
        : "Could not create the image on this browser. Use Print instead.",
    );
  }

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-label={`${tracks[lang].name} certificate of practice`}
      onClick={(e) => {
        if (e.target === dialogRef.current) dialogRef.current?.close();
      }}
    >
      <div
        className={styles.frame}
        // The SVG comes from the trusted pure certificateSvg (values escaped there).
        dangerouslySetInnerHTML={{ __html: svg }}
      />

      <form
        className={styles.nameForm}
        onSubmit={(e) => {
          e.preventDefault();
          saveName();
        }}
      >
        <label htmlFor="cert-name-input">Name on the certificate</label>
        <div className={styles.nameRow}>
          <input
            id="cert-name-input"
            className={styles.nameInput}
            maxLength={60}
            value={name}
            placeholder="Your name"
            autoComplete="name"
            onChange={(e) => setName(e.target.value)}
          />
          <button type="submit" className={styles.btn}>
            Save name
          </button>
        </div>
      </form>

      <div className={styles.actions}>
        <button
          type="button"
          className={`${styles.btn} ${styles.btnPrimary}`}
          onClick={() => window.print()}
        >
          Print
        </button>
        <button type="button" className={styles.btn} onClick={downloadPng}>
          Download PNG
        </button>
        <button
          type="button"
          className={styles.btn}
          onClick={() => dialogRef.current?.close()}
        >
          Close
        </button>
      </div>

      <p className={styles.note} role="status" aria-live="polite">
        {note ||
          "A record of practice — not a professional credential. It lives in your progress and travels with your backups."}
      </p>
    </dialog>
  );
}
