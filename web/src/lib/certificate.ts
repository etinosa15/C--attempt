// Certificate rendering — the browser half of the vanilla studio's
// certificateFigure + downloadCertificatePng (public/app.js). The SVG itself is
// produced by the shared pure `certificateSvg` in core; here we only feed it the
// track name and earned date, and rasterise it to a PNG with no dependencies.
//
// A certificate is "a record of practice, not a professional credential": its
// existence is derived from `completed` (via certificateEarned), and the earned
// date is the epoch-ms stamped once in `state.certificates[lang]`.
import { certificateSvg } from "./progress/core";
import { tracks, type Lang } from "./curriculum";
import type { ForgeState } from "./progress/state";

function certDateText(ts: number): string {
  return new Date(
    Number.isFinite(ts) && ts > 0 ? ts : Date.now(),
  ).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

/** Build the certificate SVG string for a track. `name` overrides the saved
 *  certName (used for a live preview as the learner types). */
export function certificateFigure(state: ForgeState, lang: Lang, name?: string): string {
  return certificateSvg({
    name: name ?? state.certName,
    trackName: tracks[lang].name,
    dateText: certDateText(state.certificates[lang]),
  });
}

// Serialize the SVG to a PNG the same dependency-free way the studio does: a
// data: URL (a blob: URL is disallowed by the studio's img-src CSP) drawn onto a
// canvas at 2× for a crisp download. Returns false if the browser can't rasterise
// it (the caller falls back to Print). 720×500 matches certificateSvg's viewBox.
export async function downloadCertificatePng(svg: string, lang: Lang): Promise<boolean> {
  const source = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  try {
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = () => resolve(null);
      img.onerror = () => reject(new Error("draw"));
      img.src = source;
    });
    const scale = 2;
    const canvas = document.createElement("canvas");
    canvas.width = 720 * scale;
    canvas.height = 500 * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no 2d context");
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0, 720, 500);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/png"),
    );
    if (!blob) throw new Error("encode failed");
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `forge-${lang}-certificate.png`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  } catch {
    return false;
  }
}
