import test from "node:test";
import assert from "node:assert/strict";
import {
  buddyReaction,
  normalizeBuddyPrefs,
  loadBuddyPrefs,
} from "../public/buddy.js";

test("buddyReaction picks a cheer mood for wins and stays quiet otherwise", () => {
  assert.equal(buddyReaction("solved").mood, "cheer");
  assert.equal(buddyReaction("quiz").mood, "cheer");
  assert.equal(buddyReaction("focusGoal").mood, "cheer");
  assert.equal(buddyReaction("certificate").mood, "cheer");
  assert.equal(buddyReaction("focusDone").mood, "rest");
  assert.equal(buddyReaction("review").mood, "idle");
  assert.equal(buddyReaction("nonsense"), null);
});

test("greet uses the buddy's own name", () => {
  const r = buddyReaction("greet", { name: "Cinder" });
  assert.match(r.message, /Cinder/);
});

test("complete adds a streak line only at three days or more", () => {
  assert.match(buddyReaction("complete", { streak: 4 }).message, /4 days running/);
  assert.doesNotMatch(buddyReaction("complete", { streak: 2 }).message, /days running/);
});

test("stuck voices the tutor's message when supplied, else a fallback", () => {
  assert.equal(
    buddyReaction("stuck", { message: "Check greet(\"\")." }).message,
    "Check greet(\"\").",
  );
  assert.equal(buddyReaction("stuck").mood, "think");
  assert.ok(buddyReaction("stuck").message.length > 0);
});

test("normalizeBuddyPrefs clamps a hostile or damaged value", () => {
  assert.deepEqual(normalizeBuddyPrefs(null), { hidden: false, name: "Ember" });
  assert.deepEqual(normalizeBuddyPrefs({ name: 42, hidden: "yes" }), {
    hidden: false,
    name: "Ember",
  });
  const long = normalizeBuddyPrefs({ name: "x".repeat(80), hidden: true });
  assert.equal(long.hidden, true);
  assert.equal(long.name.length, 24);
  assert.equal(normalizeBuddyPrefs({ name: "  Sol  " }).name, "Sol");
});

test("loadBuddyPrefs survives malformed storage", () => {
  const bad = { getItem: () => "{not json" };
  assert.deepEqual(loadBuddyPrefs(bad), { hidden: false, name: "Ember" });
  const good = { getItem: () => JSON.stringify({ name: "Blaze", hidden: true }) };
  assert.deepEqual(loadBuddyPrefs(good), { hidden: true, name: "Blaze" });
});
