import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { resolve } from "./resolve-ts.mjs";

// Same TS type-stripping hook the other unit tests use.
registerHooks({ resolve });

const { sanitizeDisplayName, rankLeaderboard, MAX_DISPLAY_NAME } = await import(
  "../web/src/lib/leaderboard/core.ts"
);

test("sanitizeDisplayName strips control chars, collapses space, trims, caps length", () => {
  assert.equal(sanitizeDisplayName("  Ada   Lovelace  "), "Ada Lovelace");
  assert.equal(sanitizeDisplayName("bad\u0000name\u001f!"), "bad name !");
  assert.equal(sanitizeDisplayName(""), "Anonymous");
  assert.equal(sanitizeDisplayName("   "), "Anonymous");
  assert.equal(sanitizeDisplayName(null), "Anonymous");
  assert.equal(sanitizeDisplayName("x".repeat(100)).length, MAX_DISPLAY_NAME);
});

test("sanitizeDisplayName strips angle brackets so a name can't inject markup", () => {
  assert.equal(sanitizeDisplayName("<script>evil</script>"), "scriptevil/script");
  assert.equal(sanitizeDisplayName("Ada <b>Lovelace</b>"), "Ada bLovelace/b");
  assert.equal(sanitizeDisplayName("<>"), "Anonymous"); // nothing usable left
});

test("rankLeaderboard sorts by XP desc with deterministic name tie-break", () => {
  const ranked = rankLeaderboard(
    [
      { user_id: "a", display_name: "Bo", xp: 100 },
      { user_id: "b", display_name: "Al", xp: 300 },
      { user_id: "c", display_name: "Cy", xp: 100 },
    ],
    "c",
  );
  assert.deepEqual(
    ranked.map((r) => r.displayName),
    ["Al", "Bo", "Cy"], // 300 first; the two 100s tie-break by name (Bo < Cy)
  );
  assert.equal(ranked[0].rank, 1);
  // Standard competition ranking: the two 100s share rank 2, none gets 3.
  assert.equal(ranked[1].rank, 2);
  assert.equal(ranked[2].rank, 2);
  // isMe flags the caller's row.
  assert.equal(ranked.find((r) => r.displayName === "Cy").isMe, true);
  assert.equal(ranked.find((r) => r.displayName === "Al").isMe, false);
});

test("rankLeaderboard attaches the level + title for each XP", () => {
  const [top] = rankLeaderboard([{ user_id: "a", display_name: "A", xp: 300 }], null);
  assert.equal(top.level, 3); // 300 XP -> level 3 (triangular curve)
  assert.equal(typeof top.title, "string");
});

test("rankLeaderboard on an empty board is an empty array", () => {
  assert.deepEqual(rankLeaderboard([], "me"), []);
});
