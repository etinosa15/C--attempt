// The lone inline <script> in index.html is the theme boot-guard, allowed by its
// sha256 (computed over the LF-normalised script text, as the HTML parser hashes
// it) instead of widening to 'unsafe-inline'. Keep that script byte-identical or
// regenerate this hash.
export const bootScriptHash = "'sha256-wVtf6a4QHgMjh+7h5KU6dv08CH6VCRZGMgY7c+/qY4g='";

// Cloud sync lives on its own origin, so the page has to be allowed to reach it.
// The value is interpolated straight into a header, so it is validated down to a
// bare scheme://host:port — anything else could close the directive and append
// its own (a value ending "; script-src 'unsafe-inline'" would undo the policy).
// Empty is the default and the safe one: no origin configured, no sync, and the
// policy stays exactly as strict as it was before accounts existed.
export function readSyncOrigin(value) {
  const raw = String(value ?? "").trim().replace(/\/+$/, "");
  if (!raw) return "";
  let url;
  try { url = new URL(raw); } catch { return ""; }
  if (!["https:", "http:"].includes(url.protocol)) return "";
  if (url.pathname !== "/" || url.search || url.hash || url.username || url.password) return "";
  // Session cookies are marked Secure, so a plain-http API could never hold a
  // session anyway; allow it only for local development.
  if (url.protocol === "http:" && !["localhost", "127.0.0.1"].includes(url.hostname)) return "";
  return url.origin;
}
export const syncOrigin = readSyncOrigin(globalThis.process?.env?.FORGE_SYNC_ORIGIN);
const connectSrc = ["'self'", syncOrigin].filter(Boolean).join(" ");
export const appPolicy = `default-src 'self'; script-src 'self' ${bootScriptHash}; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src ${connectSrc}; worker-src 'self'; frame-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'`;
export const workerPolicy = "default-src 'none'; script-src 'unsafe-eval'; connect-src 'none'";
export const domPolicy = "default-src 'none'; script-src 'self' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'";
export const baseHeaders = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};
export function policyFor(file) {
  return file.endsWith("runner-worker.js") ? workerPolicy : file.endsWith("dom-preview.html") ? domPolicy : appPolicy;
}
export function staticHeaders() {
  // Separate HTML and worker rules avoid combining incompatible CSPs on hosts
  // that merge matching _headers rules (including Cloudflare Pages).
  return "/*\n" + Object.entries(baseHeaders).map(([key, value]) => `  ${key}: ${value}\n`).join("") +
    "  Cache-Control: public, max-age=0, must-revalidate\n\n" +
    ["/", "/index.html", "/404.html", "/dom-preview.html", "/runner-worker.js"].map(file =>
      `${file}\n  Content-Security-Policy: ${policyFor(file)}\n`,
    ).join("\n");
}
