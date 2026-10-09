import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { resolve } from "./resolve-ts.mjs";

// Same TS type-stripping hook the other unit tests use.
registerHooks({ resolve });

const { resolveSeatUsage, canAssignSeat } = await import("../web/src/lib/teams/seats.ts");
const { resolveTeamEntitlement, maxEntitlement } = await import(
  "../web/src/lib/entitlements/team-policy.ts"
);
const { resolveEntitlement } = await import("../web/src/lib/entitlements/policy.ts");

const NOW = new Date("2026-03-01T00:00:00Z");

// --- seat math --------------------------------------------------------------
test("resolveSeatUsage reports used/available and flags over-seat", () => {
  assert.deepEqual(resolveSeatUsage(10, 4), { total: 10, used: 4, available: 6, over: false });
  const full = resolveSeatUsage(5, 5);
  assert.equal(full.available, 0);
  assert.equal(full.over, false);
  assert.equal(canAssignSeat(full), false);
  const over = resolveSeatUsage(3, 5);
  assert.equal(over.available, 0); // never negative
  assert.equal(over.over, true);
  assert.equal(canAssignSeat(resolveSeatUsage(3, 1)), true);
});

// --- team entitlement -------------------------------------------------------
const activeTeam = { status: "active", current_period_end: "2026-04-01T00:00:00Z" };
const activeMember = { status: "active", role: "member" };

test("an active member of a live team is Pro; everything else is the Free floor", () => {
  assert.equal(resolveTeamEntitlement(activeTeam, activeMember, NOW).tier, "pro");
  // Invited (not yet active) member doesn't occupy a seat -> free.
  assert.equal(resolveTeamEntitlement(activeTeam, { status: "invited" }, NOW).tier, "free");
  // Lapsed team period -> free even for an active member.
  assert.equal(
    resolveTeamEntitlement({ status: "active", current_period_end: "2026-02-01T00:00:00Z" }, activeMember, NOW).tier,
    "free",
  );
  // Canceled/expired team -> free.
  assert.equal(resolveTeamEntitlement({ status: "canceled", current_period_end: null }, activeMember, NOW).tier, "free");
  // No team / no membership -> free.
  assert.equal(resolveTeamEntitlement(null, activeMember, NOW).tier, "free");
  assert.equal(resolveTeamEntitlement(activeTeam, null, NOW).tier, "free");
});

test("past_due within the period still grants Pro (dunning grace)", () => {
  assert.equal(resolveTeamEntitlement({ status: "past_due", current_period_end: "2026-04-01T00:00:00Z" }, activeMember, NOW).tier, "pro");
});

// --- combiner ---------------------------------------------------------------
test("maxEntitlement takes the more-privileged, preferring the learner's own on a tie", () => {
  const ownFree = resolveEntitlement(null, NOW); // free
  const teamPro = resolveTeamEntitlement(activeTeam, activeMember, NOW); // pro
  // Free learner on a live team -> Pro.
  assert.equal(maxEntitlement(ownFree, teamPro).tier, "pro");

  // A learner already Pro from their own (trialing) sub keeps THEIR entitlement
  // (so the reverse-trial countdown is preserved), even if the team is also Pro.
  const ownTrial = resolveEntitlement(
    { plan: "trial", status: "trialing", trial_ends_at: "2026-03-05T00:00:00Z", current_period_end: null },
    NOW,
  );
  assert.equal(ownTrial.tier, "pro");
  assert.equal(ownTrial.inTrial, true);
  const combined = maxEntitlement(ownTrial, teamPro);
  assert.equal(combined.inTrial, true); // own trial preserved

  // Two Free -> Free.
  assert.equal(maxEntitlement(ownFree, resolveTeamEntitlement(null, null, NOW)).tier, "free");
});
