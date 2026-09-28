/* Device-local appearance preference. Deliberately OUTSIDE synced progress
   state (see docs/phase-1-plan.md): theme follows the device, never the
   account. Mirrors the vanilla studio's "forge.academy.theme" key so a learner
   moving between the studio and the React app keeps one appearance choice.

   The pre-paint boot script in app/layout.tsx already sets <html data-theme>
   before first paint to avoid a flash; these helpers are for a live toggle. */

export type ThemePref = "light" | "dark" | "system";

export const THEME_KEY = "forge.academy.theme";

export function readThemePref(): ThemePref {
  if (typeof localStorage === "undefined") return "system";
  const pref = localStorage.getItem(THEME_KEY);
  return pref === "dark" || pref === "light" ? pref : "system";
}

/** Resolve a preference to the concrete theme, honoring the OS for "system". */
export function resolveTheme(pref: ThemePref): "light" | "dark" {
  if (pref === "dark" || pref === "light") return pref;
  const dark =
    typeof matchMedia !== "undefined" &&
    matchMedia("(prefers-color-scheme: dark)").matches;
  return dark ? "dark" : "light";
}

/** Persist a preference and apply it to <html data-theme> immediately. */
export function applyThemePref(pref: ThemePref): void {
  if (typeof document === "undefined") return;
  try {
    if (pref === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, pref);
  } catch {
    /* storage may be unavailable (private mode); still apply for this session */
  }
  document.documentElement.dataset.theme = resolveTheme(pref);
}

/* The exact source of the inline pre-paint script rendered in the root layout.
   Kept as a string so the layout can inject it and, if a strict CSP is added
   later, its sha256 can be pinned the way the studio pins its boot script. */
export const THEME_BOOT_SCRIPT = `(function(){try{var p=localStorage.getItem("${THEME_KEY}");if(p!=="dark"&&p!=="light")p="system";var d=p==="dark"||(p==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.dataset.theme=d?"dark":"light";}catch(e){}})();`;
