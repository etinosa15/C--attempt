// The study buddy: a small forge-ember mascot that reacts to what the learner
// does and is the "face" that speaks the tutor's guidance and presents a finished
// track's certificate. It is 100% client-side and stores nothing but two
// device-local preferences — deliberately OUTSIDE progress state, so it is never
// synced or written into a backup, mirroring the appearance-theme precedent
// (index.html). See [[tutor]] for the guidance it voices.

const BUDDY_KEY = "forge.academy.buddy";
const DEFAULT_NAME = "Ember";
const NAME_MAX = 24;

// Pure preference shaping: a damaged or hostile stored value can never widen the
// UI or inject a non-string name. Kept separate from the DOM so it is unit-testable.
export function normalizeBuddyPrefs(raw) {
  const name =
    typeof raw?.name === "string" && raw.name.trim()
      ? raw.name.trim().slice(0, NAME_MAX)
      : DEFAULT_NAME;
  return { hidden: raw?.hidden === true, name };
}
export function loadBuddyPrefs(storage) {
  try {
    return normalizeBuddyPrefs(JSON.parse(storage.getItem(BUDDY_KEY) || "{}"));
  } catch {
    return normalizeBuddyPrefs(null);
  }
}
function saveBuddyPrefs(storage, prefs) {
  try {
    storage.setItem(BUDDY_KEY, JSON.stringify(prefs));
  } catch {
    /* A device that cannot persist a preference still shows the buddy fine. */
  }
}

// The one decision that matters for the buddy is: given something the learner
// just did, what mood does the buddy take and what — if anything — does it say?
// Pure and DOM-free so every branch can be asserted. Returns null to stay quiet,
// which is the right answer for anything not worth a celebration or a nudge.
export function buddyReaction(event, signals = {}) {
  const name = signals.name || DEFAULT_NAME;
  const streak = Number(signals.streak) || 0;
  const streakLine =
    streak >= 3 ? ` That's ${streak} days running — momentum is on your side.` : "";
  switch (event) {
    case "greet":
      return {
        mood: "idle",
        message: `Hi, I'm ${name}. I'll cheer you on, and when a check trips you up I'll point you at what to look at.`,
      };
    case "solved":
      return { mood: "cheer", message: "Challenge solved. That's the hard part done — nicely reasoned." };
    case "quiz":
      return { mood: "cheer", message: "Concept checked. Your instinct for this is sharpening." };
    case "complete":
      return { mood: "cheer", message: `Lesson complete.${streakLine || " One more idea made yours."}` };
    case "review":
      return { mood: "idle", message: "Recalling it from memory is what makes it stick." };
    case "focusGoal":
      return { mood: "cheer", message: "Daily focus goal reached — that's real consistency." };
    case "focusDone":
      return { mood: "rest", message: "Focus session done. Stand up, stretch, then come back fresh." };
    case "certificate":
      return { mood: "cheer", message: "A whole track, start to finish. Let's look at your record of practice." };
    case "stuck":
      // The specific, check-aware line comes from the tutor via say(); this is
      // only the fallback when no tutor message is supplied.
      return { mood: "think", message: signals.message || "Not passing yet — take the first failing check and trace it by hand." };
    default:
      return null;
  }
}

// Ember, rendered as a layered CSS-3D ember rather than a flat sprite. Three flame
// planes stacked in real depth (transform-style: preserve-3d, each at its own
// translateZ) give the mascot volume; a glow core sits between them and a small
// face rides the front plane. The whole stage bobs and sways, each plane flickers
// on its own offset, and on a fine pointer the stage parallax-tilts toward the
// cursor (wired in createBuddy). All motion is CSS and collapses to a static,
// still-legible ember under prefers-reduced-motion — no WebGL, no assets, no CDN,
// so it stays same-origin and offline like the rest of Forge. The face keeps the
// original .buddy-eye/.buddy-mouth classes so the existing mood rules still apply.
const SPRITE = `<span class="ember3d" aria-hidden="true">
  <span class="ember3d-stage">
    <span class="ember-layer ember-back"></span>
    <span class="ember-layer ember-mid"></span>
    <span class="ember-layer ember-front"></span>
    <span class="ember-core"></span>
    <svg class="ember-face" viewBox="0 0 48 56" aria-hidden="true" focusable="false">
      <circle class="buddy-eye" cx="20" cy="30" r="1.9"/>
      <circle class="buddy-eye" cx="28" cy="30" r="1.9"/>
      <path class="buddy-mouth" d="M20 35q4 4 8 0"/>
    </svg>
  </span>
</span>`;

// The same layered CSS-3D ember markup, exposed so other celebratory moments
// (e.g. the lesson-completion overlay in app.js) can render Ember too — one
// mascot, one source of truth, no assets/CDN. It carries only the base
// sway/flicker/pulse animations; mood tweaks are scoped to `.buddy`.
export function emberSprite() {
  return SPRITE;
}

// Build and own the buddy's DOM inside `root` (a body-level container that
// survives app.js's full #app re-renders). Everything visual lives here; app.js
// only calls react/say/setVisible/rename.
export function createBuddy({ storage, root, reducedMotion = false }) {
  let prefs = loadBuddyPrefs(storage);
  let hideTimer = null;

  root.className = "buddy" + (reducedMotion ? " buddy--reduced" : "");
  root.hidden = prefs.hidden;
  root.innerHTML = `
    <div class="buddy-bubble" role="status" aria-live="polite" hidden>
      <p class="buddy-text"></p>
      <button class="buddy-close icon-button" type="button" data-buddy-action="dismiss" aria-label="Hide the study buddy">✕</button>
    </div>
    <button class="buddy-sprite" type="button" data-buddy-action="poke" aria-label="Study buddy">${SPRITE}</button>`;

  const bubble = root.querySelector(".buddy-bubble");
  const text = root.querySelector(".buddy-text");
  const sprite = root.querySelector(".buddy-sprite");

  function setMood(mood) {
    root.dataset.mood = mood || "idle";
    sprite.classList.remove("buddy-pop");
    if (!reducedMotion && (mood === "cheer" || mood === "certificate")) {
      // Restart the one-shot pop by forcing reflow.
      void sprite.offsetWidth;
      sprite.classList.add("buddy-pop");
    }
  }

  function say(message, mood = "idle") {
    if (prefs.hidden || !message) return;
    setMood(mood);
    text.textContent = message;
    bubble.hidden = false;
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      bubble.hidden = true;
      setMood("idle");
    }, 7000);
  }

  function react(event, signals = {}) {
    const r = buddyReaction(event, { ...signals, name: prefs.name });
    if (r) say(r.message, r.mood);
  }

  function setVisible(visible) {
    prefs = { ...prefs, hidden: !visible };
    saveBuddyPrefs(storage, prefs);
    root.hidden = prefs.hidden;
    if (prefs.hidden) {
      clearTimeout(hideTimer);
      bubble.hidden = true;
    }
  }

  function rename(next) {
    prefs = normalizeBuddyPrefs({ ...prefs, name: next });
    saveBuddyPrefs(storage, prefs);
    return prefs.name;
  }

  sprite.addEventListener("click", () => react("greet"));
  root.querySelector(".buddy-close").addEventListener("click", () => setVisible(false));

  // Parallax tilt: on a fine pointer (and only when motion is allowed), lean the
  // 3D stage toward the cursor so Ember reads as a solid object catching the light.
  // Skipped entirely under reduced motion / coarse pointers, where the ember is
  // deliberately static. The stage reads --rx/--ry; leaving the sprite eases home.
  const stage = root.querySelector(".ember3d-stage");
  const finePointer = matchMedia("(hover: hover) and (pointer: fine)");
  if (stage && !reducedMotion && finePointer.matches) {
    sprite.addEventListener("pointermove", (ev) => {
      if (ev.pointerType && ev.pointerType !== "mouse") return;
      const r = sprite.getBoundingClientRect();
      const px = (ev.clientX - r.left) / r.width - 0.5;
      const py = (ev.clientY - r.top) / r.height - 0.5;
      stage.style.setProperty("--ry", `${px * 26}deg`);
      stage.style.setProperty("--rx", `${-py * 20}deg`);
    });
    sprite.addEventListener("pointerleave", () => {
      stage.style.removeProperty("--ry");
      stage.style.removeProperty("--rx");
    });
  }

  return {
    react,
    say,
    setVisible,
    rename,
    get hidden() {
      return prefs.hidden;
    },
    get name() {
      return prefs.name;
    },
  };
}
