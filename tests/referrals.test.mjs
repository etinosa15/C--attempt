import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { resolve } from "./resolve-ts.mjs";

// Same TS type-stripping hook the other unit tests use.
registerHooks({ resolve });

const { normalizeCode, isValidCode, generateCode, referralLink, referralStats } = await import(
  "../web/src/lib/referrals/core.ts"
);

test("normalizeCode uppercases and strips anything outside the alphabet", () => {
  assert.equal(normalizeCode(" ab-cd 12 "), "ABCD2"); // 1 is excluded, 2 kept
  assert.equal(normalizeCode("o0i1l"), ""); // all ambiguous chars dropped
  assert.equal(normalizeCode(null), "");
  assert.equal(normalizeCode(undefined), "");
});

test("isValidCode requires exactly the alphabet at the right length", () => {
  assert.equal(isValidCode("ABCD2345"), true);
  assert.equal(isValidCode("ABCD234"), false); // too short
  assert.equal(isValidCode("ABCD23456"), false); // too long
  assert.equal(isValidCode("ABCD234O"), false); // O is not in the alphabet
  assert.equal(isValidCode("abcd2345"), false); // must already be normalized
});

test("generateCode yields a valid code of the right length, deterministically for a fixed random", () => {
  const code = generateCode(() => 0); // always the first alphabet char
  assert.equal(code, "AAAAAAAA");
  assert.equal(isValidCode(code), true);

  // A varying source produces a valid code (not all one char).
  let i = 0;
  const varied = generateCode(() => (i++ % 8) / 8);
  assert.equal(varied.length, 8);
  assert.equal(isValidCode(varied), true);
});

test("referralLink builds /signup?ref= and tolerates a trailing slash", () => {
  assert.equal(referralLink("ABCD2345", "https://forge.dev"), "https://forge.dev/signup?ref=ABCD2345");
  assert.equal(referralLink("ABCD2345", "https://forge.dev/"), "https://forge.dev/signup?ref=ABCD2345");
});

test("referralStats counts attributed signups and those past signup", () => {
  assert.deepEqual(referralStats([]), { invited: 0, converted: 0 });
  assert.deepEqual(
    referralStats([
      { referred_id: "a", status: "signed_up" },
      { referred_id: "b", status: "converted" },
      { referred_id: "c", status: "rewarded" },
    ]),
    { invited: 3, converted: 2 },
  );
});
