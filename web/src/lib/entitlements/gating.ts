// The single seam that turns a resolved `Entitlement` into per-lesson and
// per-capability access decisions. Pure and framework-free on purpose: the client
// paywall UI, and every future server-enforced action route (the C# WASM runner in
// Phase 4, the AI tutor in Phase 5, certificate issuance and checkout), import
// THIS — never re-deriving the free/paid line inline. Change the split here once
// and every surface follows.
//
// The reverse-trial model is a *soft floor*, not a hard lockout: reading any lesson
// stays open (good for learners and for crawlers), and these gates bite only on the
// paid value — interactive practice/completion beyond the free modules, and
// certificates. During the 7-day trial `unlimitedLessons` is true, so nothing is
// locked; the floor only appears once a learner lapses to Free.
import type { Entitlement } from "./types";

/**
 * How many leading modules of each track the Free floor includes, counted by a
 * lesson's `module` index (both tracks share the same ordered module list, so
 * index 0 is "Foundations" in each). The single knob for the free/paid split —
 * raise it to widen the floor. Matches the pricing copy ("first chapter of each
 * track, free").
 */
export const FREE_MODULE_COUNT = 1;

/** Minimal shape these decisions need from a lesson — just its module index. */
type LessonLike = { module: number };

/**
 * Is this lesson inside the always-free floor? True for the first
 * `FREE_MODULE_COUNT` modules of either track, regardless of plan — the part every
 * learner (signed out, Free, trial, or Pro) may practise and complete.
 */
export function isFreeLesson(lesson: LessonLike): boolean {
  return lesson.module < FREE_MODULE_COUNT;
}

/**
 * May this learner do the graded, interactive beats of a lesson — the quiz, the
 * coding challenge, and marking it complete? Free-floor lessons are always open;
 * everything beyond needs the `unlimitedLessons` capability (trial or Pro). A null
 * entitlement (signed-out, or before it resolves) is treated as the Free floor.
 */
export function canPractice(
  entitlement: Entitlement | null | undefined,
  lesson: LessonLike,
): boolean {
  if (isFreeLesson(lesson)) return true;
  return !!entitlement?.features.unlimitedLessons;
}

/**
 * Is a lesson gated *for this learner* — i.e. beyond the free floor and not
 * unlocked by their plan? The inverse of {@link canPractice}, named for the call
 * site that renders the paywall.
 */
export function isLessonLocked(
  entitlement: Entitlement | null | undefined,
  lesson: LessonLike,
): boolean {
  return !canPractice(entitlement, lesson);
}

/**
 * May this learner claim / view a track certificate? A paid capability: a learner
 * who reached 100% during the trial but has since lapsed to Free keeps their
 * progress but not the credential until they upgrade.
 */
export function canEarnCertificate(
  entitlement: Entitlement | null | undefined,
): boolean {
  return !!entitlement?.features.certificates;
}

/**
 * May this learner run C# in the browser-hosted runner (the Phase 4 WASM compile)?
 * A paid capability; the free floor's C# lessons stay readable and JS practice is
 * unaffected. Exposed here so the runner route can enforce it server-side when it
 * lands — today no server compile route exists on the hosted surface to gate.
 */
export function canRunCsharp(
  entitlement: Entitlement | null | undefined,
): boolean {
  return !!entitlement?.features.runCsharp;
}
