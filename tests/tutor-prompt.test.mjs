import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeTutorPayload, buildAnthropicRequest, extractMessage, SYSTEM_PROMPT } from "../tutor/prompt.mjs";

test("the system prompt forbids handing over the full solution", () => {
  assert.match(SYSTEM_PROMPT, /do not write/i);
  assert.match(SYSTEM_PROMPT, /solution/i);
});

test("a hostile payload is clamped to the known shape and lengths", () => {
  const clean = sanitizeTutorPayload({
    lang: "python",                       // not js/cs → defaults to js
    title: "x".repeat(500),
    code: "y".repeat(9000),
    tier: -5, passed: "3", total: 2.5,    // non-integers dropped to 0
    firstFailing: { label: "z".repeat(500), expected: { a: 1 } },
    extra: "ignored",
  });
  assert.equal(clean.lang, "js");
  assert.equal(clean.title.length, 200);
  assert.equal(clean.code.length, 8000);
  assert.equal(clean.tier, 0);
  assert.equal(clean.passed, 0);
  assert.equal(clean.total, 0);
  assert.equal(clean.firstFailing.label.length, 200);
  assert.equal(clean.firstFailing.expected, JSON.stringify({ a: 1 }));
  assert.equal("extra" in clean, false);
});

test("non-object payloads produce null and no request body", () => {
  for (const bad of [null, undefined, "str", 7, []]) {
    assert.equal(sanitizeTutorPayload(bad), null);
    assert.equal(buildAnthropicRequest(bad, { model: "m" }), null);
  }
});

test("the request carries the model, the failing case, and the code", () => {
  const body = buildAnthropicRequest({
    lang: "cs", title: "Loops", passed: 1, total: 3,
    firstFailing: { label: "handles zero", expected: "0" },
    code: "Console.WriteLine(1);",
  }, { model: "claude-haiku-4-5-20251001" });
  assert.equal(body.model, "claude-haiku-4-5-20251001");
  assert.equal(body.system, SYSTEM_PROMPT);
  const content = body.messages[0].content;
  assert.match(content, /C#/);
  assert.match(content, /handles zero/);
  assert.match(content, /Console\.WriteLine/);
  assert.ok(body.max_tokens > 0 && body.max_tokens <= 512);
});

test("extractMessage joins text blocks and ignores other shapes", () => {
  assert.equal(extractMessage({ content: [{ type: "text", text: "Hi " }, { type: "text", text: "there" }] }), "Hi there");
  assert.equal(extractMessage({ content: [{ type: "tool_use" }] }), "");
  assert.equal(extractMessage({}), "");
  assert.equal(extractMessage(null), "");
  assert.equal(extractMessage({ content: [{ type: "text", text: "x".repeat(700) }] }).length, 600);
});
