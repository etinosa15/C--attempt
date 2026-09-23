// The tutor turns "your checks didn't all pass" into a specific, human nudge —
// naming the first failing case and pointing at what to compare — and hands it to
// the study buddy ([[buddy]]) to speak. It is a thin seam over a *provider*:
//
//   provider.respond({ lesson, results, error, tier })
//     -> { message, suggestedTier, offerSolution } | null   (null = stay quiet)
//
// Today the only provider is `heuristicProvider`: pure, deterministic, offline,
// no key, nothing uploaded — so Forge's offline/no-key/nothing-uploaded promises
// hold. A future hosted LLM tutor is simply a SECOND provider with the same async
// `respond`, selected the way accounts are gated (deployment.syncOrigin): a
// build-time origin plus an opt-in proxy service that holds the API key
// server-side and is reached through the CSP connect-src. Nothing in this file
// needs to change to adopt it — swap the provider passed to createTutor.

import { explainError, hintTiers } from "./core.js";

// Index of the ladder tiers so a provider can ask for the right level of help.
// hintTiers(lesson) yields: [concept…, "check the failing test", {solution}].
const CONCEPT_TIER = 1; // at least the first conceptual nudge revealed
const FAILING_TIER = 2; // also reveal "check the failing test"

export function firstFailure(results = []) {
  const index = results.findIndex((t) => t && !t.passed);
  return index === -1 ? null : { index, result: results[index] };
}

function describeExpected(check) {
  if (!check || check.expected === undefined) return "";
  let value;
  try {
    value = typeof check.expected === "string" ? check.expected : JSON.stringify(check.expected);
  } catch {
    return "";
  }
  if (typeof value !== "string" || !value) return "";
  return value.length > 60 ? "" : ` It expects \`${value}\`.`;
}

export const heuristicProvider = {
  // eslint-disable-next-line require-await -- async to match the provider seam
  async respond({ lesson, results = [], error = null, tier = 0 }) {
    // A thrown error is the most concrete thing to explain: route it through the
    // same guide the output panel uses, so the buddy and the panel never disagree.
    if (error) {
      const guide = explainError(error, lesson?.lang);
      const message = guide
        ? `${guide.summary} ${guide.hint}`
        : "The code stopped before the checks could run. Read the error under the editor and fix that first.";
      return { message, suggestedTier: CONCEPT_TIER, offerSolution: false, kind: "error" };
    }
    const fail = firstFailure(results);
    if (!fail) return null; // all checks passed (or none ran) — no nagging.

    const total = results.length;
    const passed = results.filter((t) => t.passed).length;
    const check = lesson?.challenge?.tests?.[fail.index];
    const label = fail.result?.label || check?.label || "the failing check";
    // After a couple of attempts, stop hinting and offer the worked solution.
    const tiers = lesson ? hintTiers(lesson).length : 3;
    const offerSolution = tier >= FAILING_TIER;
    const message = offerSolution
      ? `Still stuck on "${label}" after ${passed} of ${total} passing. It's fair to read the worked solution now, then rebuild it from memory.`
      : `You're passing ${passed} of ${total}. The first that fails is "${label}".${describeExpected(check)} Run your code on that exact case by hand and compare what you get with what it expects.`;
    return {
      message,
      suggestedTier: offerSolution ? tiers : FAILING_TIER,
      offerSolution,
      kind: "check",
    };
  },
};

export function createTutor({ provider = heuristicProvider } = {}) {
  return {
    provider,
    respond: (context) => provider.respond(context),
  };
}
