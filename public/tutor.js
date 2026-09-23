// The tutor turns "your checks didn't all pass" into a specific, human nudge —
// naming the first failing case and pointing at what to compare — and hands it to
// the study buddy ([[buddy]]) to speak. It is a thin seam over a *provider*:
//
//   provider.respond({ lesson, results, error, tier })
//     -> { message, suggestedTier, offerSolution } | null   (null = stay quiet)
//
// Today the default provider is `heuristicProvider`: pure, deterministic, offline,
// no key, nothing uploaded — so Forge's offline/no-key/nothing-uploaded promises
// hold. The optional hosted tutor is a SECOND provider (`createRemoteProvider`,
// below) with the same async `respond`, selected the way accounts are gated
// (deployment.tutorOrigin): a build-time origin plus an opt-in proxy service that
// holds the API key server-side and is reached through the CSP connect-src. It
// falls back to the heuristic on any failure, so nothing else in this file — or
// in the app — has to change to adopt it: swap the provider passed to createTutor.

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

// The second provider promised in the header: a hosted LLM reached through the
// tutor proxy (tutor-server.mjs), gated by a build-time origin exactly like
// accounts. It never holds an API key — the proxy does — and it degrades to the
// heuristic on any failure, so a slow, down, or misbehaving service can only ever
// cost a better hint, never the nudge the learner was already getting offline.
const REQUEST_MS = 12000;

// What crosses the network. The learner's code is included so the tutor can be
// specific; the worked solution is not — the model should coach, not read it out,
// and there is no reason to ship the answer to a third party.
function tutorPayload({ lesson, results = [], error = null, tier = 0, code = "" }) {
  const fail = firstFailure(results);
  const check = lesson?.challenge?.tests?.[fail?.index ?? -1];
  return {
    lang: lesson?.lang === "cs" ? "cs" : "js",
    title: typeof lesson?.title === "string" ? lesson.title.slice(0, 200) : "",
    prompt: typeof lesson?.challenge?.prompt === "string" ? lesson.challenge.prompt.slice(0, 2000) : "",
    code: typeof code === "string" ? code.slice(0, 8000) : "",
    error: error ? String(error).slice(0, 1000) : null,
    tier: Number.isInteger(tier) ? tier : 0,
    passed: results.filter((t) => t && t.passed).length,
    total: results.length,
    firstFailing: fail ? {
      label: fail.result?.label || check?.label || "",
      expected: check?.expected,
    } : null,
  };
}

export function createRemoteProvider({
  origin,
  fetchImpl = (...args) => fetch(...args),
  fallback = heuristicProvider,
  timeoutMs = REQUEST_MS,
} = {}) {
  if (!origin) return fallback; // Nothing configured: stay entirely offline.
  return {
    async respond(context) {
      // The offline nudge is the floor. Compute it first so the network is only
      // ever an upgrade, and so a passing run stays silent without a request.
      const base = await fallback.respond(context);
      if (!base) return null;
      const controller = new AbortController();
      const deadline = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetchImpl(origin + "/api/tutor", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Forge-Tutor": "1" },
          cache: "no-store",
          signal: controller.signal,
          body: JSON.stringify(tutorPayload(context)),
        });
        if (!response.ok) return base;
        const data = await response.json();
        const message = typeof data?.message === "string" ? data.message.trim() : "";
        if (!message) return base;
        // The model writes the words; the ladder decisions stay with the
        // deterministic side, so hosted or not, help escalates the same way.
        return { ...base, message: message.slice(0, 600) };
      } catch {
        return base; // Aborted, offline, or unparseable — the learner still gets the nudge.
      } finally {
        clearTimeout(deadline);
      }
    },
  };
}
