// Apply a saved theme before the stylesheets render to avoid a bright first frame.
(() => {
  const key = "forge.theme.v1";
  const valid = (value) => ["light", "dark", "system"].includes(value);
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  let preference = "system";
  try {
    const saved = localStorage.getItem(key);
    if (valid(saved)) preference = saved;
  } catch { /* Use the device theme when storage is unavailable. */ }
  function resolved() {
    return preference === "system" ? (media.matches ? "dark" : "light") : preference;
  }
  function apply() {
    const theme = resolved();
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#15141d" : "#f8f9fb");
    window.dispatchEvent(new CustomEvent("forge:themechange"));
  }
  window.ForgeTheme = Object.freeze({
    getPreference: () => preference,
    getResolved: resolved,
    setPreference(value) {
      if (!valid(value)) return false;
      preference = value;
      let saved = true;
      try { localStorage.setItem(key, value); } catch { saved = false; }
      apply();
      return saved;
    },
  });
  media.addEventListener("change", () => { if (preference === "system") apply(); });
  window.addEventListener("storage", (event) => {
    if (event.key !== key && event.key !== null) return;
    preference = valid(event.newValue) ? event.newValue : "system";
    apply();
  });
  apply();
})();
