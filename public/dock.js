// Dock-style proximity magnification for dock-like navigation rows.
//
// Rebuilt in vanilla JS from React Bits' "Dock" (the macOS-dock magnify effect) —
// no React, no framework. The pointer's position along the row's main axis drives
// a transform-only scale + slight lean on each item, so neighbours swell as the
// cursor nears and nothing in the layout reflows (transforms don't affect box flow).
//
// Two orientations share one implementation: the vertical sidebar nav (axis "y",
// items lean toward the content) and horizontal tab rows (axis "x", items lift
// off the bar). Pass { axis, selector } to target either.
//
// Fully disabled under prefers-reduced-motion and on coarse/touch pointers, so it
// never fights a screen reader, a phone, or a learner who asked for less motion.
// #app is re-rendered on every route change, so initDock is called again after
// each render against the fresh element; listeners live on that element and die
// with it, so there is nothing to tear down.

const reduce = matchMedia("(prefers-reduced-motion: reduce)");
const finePointer = matchMedia("(hover: hover) and (pointer: fine)");

// Defaults tuned for the vertical sidebar nav. Callers can dial the effect down
// (e.g. the curriculum tab row wants a much lighter swell than the main nav).
const DEFAULTS = {
  scale: 0.11, // +11% for the item directly under the cursor
  radius: 90, // px of influence on either side of the cursor along the axis
  shift: 5, // px the nearest item leans toward the content / off the bar
};

// smoothstep: 0→0, 1→1 with eased ends, so the swell rolls off gently.
const smooth = (t) => t * t * (3 - 2 * t);

export function initDock(
  container,
  { axis = "y", selector = ".nav-item", scale = DEFAULTS.scale, radius = DEFAULTS.radius, shift = DEFAULTS.shift } = {},
) {
  if (!container || reduce.matches || !finePointer.matches) return;
  const items = [...container.querySelectorAll(selector)];
  if (!items.length) return;

  let frame = 0;
  let pointer = 0;

  const paint = () => {
    frame = 0;
    for (const el of items) {
      const rect = el.getBoundingClientRect();
      const center =
        axis === "x" ? rect.left + rect.width / 2 : rect.top + rect.height / 2;
      const eased = smooth(Math.max(0, 1 - Math.abs(pointer - center) / radius));
      const lean = shift * eased;
      el.style.transform =
        axis === "x"
          ? `translateY(${-lean}px) scale(${1 + scale * eased})`
          : `translateX(${lean}px) scale(${1 + scale * eased})`;
    }
  };

  const clear = () => {
    if (frame) cancelAnimationFrame(frame), (frame = 0);
    for (const el of items) el.style.transform = "";
    container.classList.remove("docking");
  };

  container.addEventListener("pointermove", (ev) => {
    if (ev.pointerType && ev.pointerType !== "mouse") return; // mouse only
    pointer = axis === "x" ? ev.clientX : ev.clientY;
    container.classList.add("docking");
    if (!frame) frame = requestAnimationFrame(paint);
  });
  container.addEventListener("pointerleave", clear);
}
