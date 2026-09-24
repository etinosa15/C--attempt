// Route- and boot-level loading indicator: a self-hosted LDRS-style web component.
//
// LDRS (github.com/GriffinJohnston/ldrs) ships its loaders as framework-free custom
// elements. In that same spirit — and to keep everything same-origin with no CDN —
// this is a from-scratch vanilla rebuild of its "ring" loader: a copper arc that
// sweeps a faint track. Colour is read from --accent (custom properties inherit
// through the shadow boundary), so it tracks the theme with no per-use styling.
//
// Registered as <forge-loader>. Honours prefers-reduced-motion by holding a static
// ring instead of spinning, so a route change never animates for a learner who
// asked for less motion. style-src allows 'unsafe-inline', so the shadow <style>
// needs no CSP change.

class ForgeLoader extends HTMLElement {
  connectedCallback() {
    if (this.shadowRoot) return; // upgrade once; connect/disconnect keeps the tree
    const size = Math.max(12, Number(this.getAttribute("size")) || 44);
    const stroke = Math.max(2, Number(this.getAttribute("stroke")) || Math.round(size / 11));
    const label = this.getAttribute("label") || "Loading";
    const root = this.attachShadow({ mode: "open" });
    root.innerHTML =
      `<style>
        :host { display: inline-grid; place-items: center; line-height: 0; }
        .ring {
          width: ${size}px; height: ${size}px; border-radius: 50%;
          /* Conic sweep fading from accent to transparent, masked to a ring band of
             width ${stroke}px, then spun by transform — the standard CSS ring trick. */
          background: conic-gradient(from 0deg,
            transparent 0deg,
            color-mix(in srgb, var(--accent, #c2703d) 12%, transparent) 120deg,
            var(--accent, #c2703d) 340deg,
            var(--accent, #c2703d) 360deg);
          -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - ${stroke}px), #000 calc(100% - ${stroke}px));
          mask: radial-gradient(farthest-side, transparent calc(100% - ${stroke}px), #000 calc(100% - ${stroke}px));
          animation: forge-loader-spin 0.85s linear infinite;
          filter: drop-shadow(0 0 6px color-mix(in srgb, var(--accent, #c2703d) 40%, transparent));
        }
        @keyframes forge-loader-spin { to { transform: rotate(360deg); } }
        @media (prefers-reduced-motion: reduce) { .ring { animation: none; opacity: 0.85; } }
      </style>
      <div class="ring" role="status" aria-label="${label.replace(/"/g, "&quot;")}"></div>`;
  }
}

if (!customElements.get("forge-loader")) customElements.define("forge-loader", ForgeLoader);
