window.addEventListener("message", (event) => {
  if (event.source !== parent) return;
  if (event.data?.type === "forge-theme") {
    if (["dark", "light"].includes(event.data.theme)) document.documentElement.dataset.theme = event.data.theme;
    return;
  }
  if (event.data?.type !== "forge-dom") return;
  const report = (message) =>
    parent.postMessage({ type: "forge-dom-output", message }, "*");
  try {
    document.getElementById("preview").innerHTML = event.data.html;
    new Function("console", event.data.code)({
      log: (...args) => report(args.map(String).join(" ")),
      error: (...args) => report(args.map(String).join(" ")),
    });
    report("Preview updated. Try interacting with it.");
  } catch (error) {
    report(error.name + ": " + error.message);
  }
});
window.addEventListener("error", (event) =>
  parent.postMessage({ type: "forge-dom-output", message: event.message }, "*"),
);
