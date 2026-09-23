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

const SPRITE = `<svg class="buddy-svg" viewBox="0 0 48 56" width="52" height="60" aria-hidden="true" focusable="false">
  <path class="buddy-flame" d="M24 3c4 9 13 11 13 22a13 13 0 0 1-26 0c0-5 3-9 6-11-1 6 2 7 2 7s5-6 5-18z"/>
  <ellipse class="buddy-glow" cx="24" cy="30" rx="9" ry="10"/>
  <circle class="buddy-eye" cx="20" cy="28" r="1.7"/>
  <circle class="buddy-eye" cx="28" cy="28" r="1.7"/>
  <path class="buddy-mouth" d="M20 33q4 4 8 0"/>
</svg>`;

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
