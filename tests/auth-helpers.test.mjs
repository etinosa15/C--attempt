import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { resolve } from "./resolve-ts.mjs";

registerHooks({ resolve });
const { normalizeEmail, safeNextPath, suggestEmail, cleanDisplayName } = await import(
  "../web/src/lib/auth-helpers.ts"
);
const { seededShuffle, hashSeed } = await import("../web/src/lib/shuffle.ts");
const { friendlyAuthError } = await import("../web/src/lib/auth-errors.ts");

// --- return path validation (open-redirect guard) ---------------------------
test("safeNextPath keeps same-origin relative paths", () => {
  assert.equal(safeNextPath("/learn/lesson/js-values"), "/learn/lesson/js-values");
  assert.equal(safeNextPath("/learn?track=cs"), "/learn?track=cs");
});

test("safeNextPath rejects anything that could leave the site", () => {
  for (const bad of [
    "https://evil.com",
    "//evil.com",
    "/\\evil.com",
    "@evil.com",
    "evil.com",
    "javascript:alert(1)",
    "/learn\nSet-Cookie:x",
    "/a\\b",
    "",
    null,
    undefined,
  ]) {
    assert.equal(safeNextPath(bad), "/learn", `should reject ${JSON.stringify(bad)}`);
  }
  assert.equal(safeNextPath("//evil.com", "/"), "/");
});

// --- email ----------------------------------------------------------------
test("normalizeEmail trims and lowercases", () => {
  assert.equal(normalizeEmail("  Ada@Example.COM "), "ada@example.com");
});

test("suggestEmail fixes common domain typos and stays quiet otherwise", () => {
  assert.equal(suggestEmail("ada@gmial.com"), "ada@gmail.com");
  assert.equal(suggestEmail("Ada@Hotmial.com"), "ada@hotmail.com");
  assert.equal(suggestEmail("ada@yahoo.con"), "ada@yahoo.com");
  assert.equal(suggestEmail("ada@gmail.com"), null);
  assert.equal(suggestEmail("ada@company.ng"), null);
  assert.equal(suggestEmail("not-an-email"), null);
  assert.equal(suggestEmail("ada@"), null);
});

test("cleanDisplayName strips control characters and caps length", () => {
  assert.equal(cleanDisplayName("Ada\u0000 Lovelace\u0007"), "Ada Lovelace");
  assert.equal(cleanDisplayName("x".repeat(60)).length, 40);
});

// --- quiz shuffle ---------------------------------------------------------
test("seededShuffle is deterministic per seed and a true permutation", () => {
  const items = [0, 1, 2, 3];
  const a = seededShuffle(items, "js-values");
  const b = seededShuffle(items, "js-values");
  assert.deepEqual(a, b);
  assert.deepEqual([...a].sort(), items);
  assert.deepEqual(items, [0, 1, 2, 3]); // input untouched
});

test("seededShuffle moves the first option off slot A for many lessons", () => {
  // Across a spread of ids, option 0 must not always stay first.
  const ids = Array.from({ length: 40 }, (_, i) => `lesson-${i}`);
  const stayedFirst = ids.filter((id) => seededShuffle([0, 1, 2, 3], id)[0] === 0).length;
  assert.ok(stayedFirst < ids.length / 2, `option 0 stayed first ${stayedFirst}/40 times`);
  assert.equal(typeof hashSeed("x"), "number");
});

// --- expired-link errors --------------------------------------------------
test("friendlyAuthError explains an expired or reused email link", () => {
  assert.match(friendlyAuthError("Auth session missing!"), /expired or was already used/);
  assert.match(friendlyAuthError("Email link is invalid or has expired"), /expired or was already used/);
});
