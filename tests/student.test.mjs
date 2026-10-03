import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { resolve } from "./resolve-ts.mjs";

// Same TS type-stripping hook the other unit tests use.
registerHooks({ resolve });

const { resolveStudentStatus, pickCheckoutDiscount } = await import(
  "../web/src/lib/payments/student.ts"
);

const NOW = new Date("2026-03-01T00:00:00Z");

test("resolveStudentStatus: only a verified, unexpired row is an active student", () => {
  assert.deepEqual(resolveStudentStatus(null, NOW), { verified: false, expiresAt: null });
  assert.deepEqual(resolveStudentStatus({ status: "pending", expires_at: null }, NOW), {
    verified: false,
    expiresAt: null,
  });
  assert.deepEqual(
    resolveStudentStatus({ status: "verified", expires_at: "2026-09-01T00:00:00Z" }, NOW),
    { verified: true, expiresAt: "2026-09-01T00:00:00Z" },
  );
});

test("resolveStudentStatus: an expired verification is no longer active", () => {
  const out = resolveStudentStatus({ status: "verified", expires_at: "2026-02-01T00:00:00Z" }, NOW);
  assert.equal(out.verified, false);
  // A verified row with no expiry stays active.
  assert.equal(resolveStudentStatus({ status: "verified", expires_at: null }, NOW).verified, true);
});

test("pickCheckoutDiscount never stacks: student wins, else founding, else none", () => {
  assert.equal(
    pickCheckoutDiscount({ studentDiscountId: "dsc_student", foundingDiscountId: "dsc_launch" }),
    "dsc_student",
  );
  assert.equal(pickCheckoutDiscount({ foundingDiscountId: "dsc_launch" }), "dsc_launch");
  assert.equal(pickCheckoutDiscount({ studentDiscountId: "dsc_student" }), "dsc_student");
  assert.equal(pickCheckoutDiscount({}), null);
  assert.equal(
    pickCheckoutDiscount({ studentDiscountId: null, foundingDiscountId: null }),
    null,
  );
});
