import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { resolve } from "./resolve-ts.mjs";

// Same TS type-stripping hook the other unit tests use.
registerHooks({ resolve });

const { resolveQuota, utcDayKey, TUTOR_DAILY_LIMIT } = await import(
  "../web/src/lib/tutor/quota.ts"
);

test("resolveQuota allows while under the limit and denies at it", () => {
  const first = resolveQuota(0, 20);
  assert.equal(first.allowed, true);
  assert.equal(first.used, 0);
  assert.equal(first.remaining, 20);
  assert.equal(first.limit, 20);

  const last = resolveQuota(19, 20);
  assert.equal(last.allowed, true);
  assert.equal(last.remaining, 1);

  const over = resolveQuota(20, 20);
  assert.equal(over.allowed, false);
  assert.equal(over.remaining, 0);

  // Already past (shouldn't happen, but never go negative).
  const past = resolveQuota(25, 20);
  assert.equal(past.allowed, false);
  assert.equal(past.remaining, 0);
});

test("resolveQuota floors fractional/negative usage and a non-positive limit is a kill-switch", () => {
  assert.equal(resolveQuota(-5, 20).used, 0);
  assert.equal(resolveQuota(3.9, 20).used, 3);
  const off = resolveQuota(0, 0);
  assert.equal(off.allowed, false); // limit 0 denies everything
  assert.equal(off.remaining, 0);
});

test("resolveQuota defaults to TUTOR_DAILY_LIMIT", () => {
  assert.equal(resolveQuota(0).limit, TUTOR_DAILY_LIMIT);
  assert.ok(TUTOR_DAILY_LIMIT > 0);
});

test("utcDayKey is a UTC YYYY-MM-DD bucket, stable within a day, rolls at the boundary", () => {
  assert.equal(utcDayKey(new Date("2026-03-15T00:00:00Z")), "2026-03-15");
  assert.equal(utcDayKey(new Date("2026-03-15T23:59:59Z")), "2026-03-15");
  assert.equal(utcDayKey(new Date("2026-03-16T00:00:00Z")), "2026-03-16");
});
