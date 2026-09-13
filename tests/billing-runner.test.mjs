import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { createBilling, validSignature, periodEnd } from "../billing.mjs";
import { createOnlineRunner, parseOnlineResult } from "../online-runner.mjs";
import { curriculumFor } from "../content-access.mjs";
import { planPrice } from "../public/plans.js";

test("NGN prices, annual savings, and calendar renewal dates are correct", () => {
  assert.equal(planPrice("monthly").total * 100, 300000);
  assert.equal(planPrice("yearly").total * 100, 2880000);
  assert.equal(planPrice("yearly").annualSaving, 7200);
  assert.equal(new Date(periodEnd("2026-01-31T12:00:00Z", "monthly")).toISOString(), "2026-02-28T12:00:00.000Z");
  assert.equal(new Date(periodEnd("2024-02-29T12:00:00Z", "yearly")).toISOString(), "2025-02-28T12:00:00.000Z");
});
test("signed webhooks reject tampering and malformed signatures", () => {
  const raw = Buffer.from('{"event":"charge.success"}'), key = "sk_test_fixture", signature = createHmac("sha512", key).update(raw).digest("hex");
  assert.equal(validSignature(raw, signature, key), true);
  assert.equal(validSignature(Buffer.from("changed"), signature, key), false);
  assert.equal(validSignature(raw, "short", key), false);
});
test("payment verification checks ownership, amount, currency, mode, plan and is idempotent", async () => {
  const reference = "forge-test-payment", paidAt = new Date().toISOString();
  const state = { users: { learner: { id: "learner", email: "learner@example.test", verified: true } }, orders: { [reference]: { userId: "learner", billing: "yearly", createdAt: Date.now() } } };
  const tx = { reference, status: "success", currency: "NGN", amount: 2880000, domain: "test", plan: { plan_code: "PLN_year" }, customer: { email: "learner@example.test", customer_code: "CUS_learner" }, paid_at: paidAt };
  const members = { emailEnabled: true, store: { read: () => structuredClone(state), transaction: async fn => fn(state) } };
  let calls = 0;
  const config = { origin: "http://localhost:4317", production: false, env: { PAYSTACK_SECRET_KEY: "sk_test_fixture", PAYSTACK_MONTHLY_PLAN: "PLN_month", PAYSTACK_YEARLY_PLAN: "PLN_year" } };
  const billing = createBilling(config, members, { fetchImpl: async () => { calls++; return { ok: true, json: async () => ({ status: true, data: tx }) }; } });
  await assert.rejects(() => billing.reconcile(reference, "stranger"), /not found/);
  tx.amount = 300000; await assert.rejects(() => billing.reconcile(reference, "learner"), /do not match/); tx.amount = 2880000;
  tx.currency = "USD"; await assert.rejects(() => billing.reconcile(reference, "learner"), /do not match/); tx.currency = "NGN";
  tx.customer.email = "other@example.test"; await assert.rejects(() => billing.reconcile(reference, "learner"), /ownership/); tx.customer.email = "learner@example.test";
  const paid = await billing.reconcile(reference, "learner"); assert.equal(paid.status, "paid");
  assert.equal(state.users.learner.membership.paidUntil, periodEnd(paidAt, "yearly"));
  const before = calls; await billing.reconcile(reference, "learner"); assert.equal(calls, before);
  const live = createBilling({ ...config, env: { ...config.env, PAYSTACK_SECRET_KEY: "sk_live_fixture" } }, members);
  assert.equal(live.enabled, false);
});
test("free curriculum responses never include premium examples, answers, or briefs", () => {
  const free = curriculumFor(false), paid = curriculumFor(true);
  assert.equal(free.lessons.filter(l => !l.locked).length, 8);
  assert.equal(free.projects.filter(p => !p.locked).length, 2);
  const privateLesson = paid.lessons.find(l => l.module > 0), redacted = free.lessons.find(l => l.id === privateLesson.id);
  assert.equal(redacted.example, undefined); assert.equal(redacted.quiz, undefined); assert.equal(redacted.challenge.solution, undefined);
  assert.equal(free.tracks.js.lessons.filter(l => l.locked).length, 16);
});
test("online compiler sends resource limits and parses real check results", async () => {
  let submission;
  const runner = createOnlineRunner({ JUDGE0_URL: "https://compiler.example.test", JUDGE0_API_KEY: "fixture", JUDGE0_CSHARP_LANGUAGE_ID: "999" }, {
    sleep: async () => {}, fetchImpl: async (url, options) => {
      if (options.method === "POST") { submission = JSON.parse(options.body); return { ok: true, text: async () => JSON.stringify({ token: "test-submission-token-12345" }) }; }
      const source = Buffer.from(submission.source_code, "base64").toString(), marker = source.match(/__FORGE_[a-f0-9]+__/)[0];
      return { ok: true, text: async () => JSON.stringify({ status: { id: 3 }, exit_code: 0, stdout: Buffer.from(`hello\n${marker}{"index":0,"actual":4}`).toString("base64") }) };
    },
  });
  const result = await runner.execute("static int Add(int x) => x+1;", [{ expression: "Add(3)", expected: 4, label: "adds one" }]);
  assert.equal(submission.enable_network, false); assert.equal(submission.cpu_time_limit, 5); assert.equal(submission.memory_limit, 262144);
  assert.deepEqual(result.logs, ["hello"]); assert.equal(result.results[0].passed, true); assert.equal(result.error, undefined);
});
test("online compiler fails honestly for missing setup, compile errors, and incomplete checks", async () => {
  assert.match((await createOnlineRunner({}).execute("code")).error, /not connected/);
  assert.match(parseOnlineResult({ status: { id: 6 }, compile_output: Buffer.from("CS1002: expected ;").toString("base64") }, [], "marker").error, /CS1002/);
  assert.match(parseOnlineResult({ status: { id: 3 }, exit_code: 0 }, [{ expression: "Add(3)", expected: 4 }], "marker").error, /before all checks/);
  assert.match(parseOnlineResult({ status: { id: 5 } }, [], "marker").error, /time limit/);
});
