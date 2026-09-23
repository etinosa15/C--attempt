import test from "node:test";
import assert from "node:assert/strict";
import { formatValue, valueKind, typeMismatch, explainError } from "../public/core.js";

test("checked values are shown in the shape the learner wrote them", () => {
  assert.equal(formatValue("5"), '"5"');
  assert.equal(formatValue(5), "5");
  assert.equal(formatValue(""), '""');
  assert.equal(formatValue(undefined), "undefined");
  assert.equal(formatValue(null), "null");
  assert.equal(formatValue(false), "false");
  assert.equal(formatValue(10n), "10n");
  // Small collections read better on one line; long ones need their structure.
  assert.equal(formatValue([1, 2, 3]), "[ 1, 2, 3 ]");
  assert.equal(formatValue({ name: "Ada", age: 36 }), '{ "name": "Ada", "age": 36 }');
  assert.ok(formatValue(Array.from({ length: 20 }, (_, i) => i)).includes("\n"));
  // Values JSON cannot represent must still render rather than disappear.
  assert.equal(formatValue(Symbol.for("id")), "Symbol(id)");
  assert.equal(formatValue(() => 1), "() => 1");
  const cyclic = { name: "loop" };
  cyclic.self = cyclic;
  assert.equal(formatValue(cyclic), "[object Object]");
});

test("a value that is right but typed wrong is reported as such", () => {
  assert.equal(valueKind(null), "null");
  assert.equal(valueKind([]), "array");
  assert.equal(valueKind({}), "object");
  assert.equal(valueKind("a"), "string");
  // The JS↔C# slip this curriculum keeps provoking.
  assert.equal(typeMismatch(5, "5"), true);
  assert.equal(typeMismatch(true, "true"), true);
  // Returning the joined text of a collection is the same confusion.
  assert.equal(typeMismatch([1, 2], "1,2"), true);
  assert.equal(typeMismatch(null, "null"), true);
  // Genuinely different values are a different mistake and must not be labelled.
  assert.equal(typeMismatch(5, 6), false);
  assert.equal(typeMismatch("5", "5"), false);
  assert.equal(typeMismatch([1, 2], "2,1"), false);
  assert.equal(typeMismatch([1, 2], [1, 2]), false);
});

test("compiler and runtime errors are translated into the next thing to try", () => {
  const unknown = explainError("error CS0103: The name 'totl' does not exist in the current context", "cs");
  assert.match(unknown.summary, /totl/);
  assert.match(unknown.hint, /case-sensitive/);
  assert.match(
    explainError("Program.cs(7,23): error CS1002: ; expected", "cs").summary,
    /semicolon/,
  );
  assert.match(
    explainError("error CS0161: 'Grade(int)': not all code paths return a value", "cs").summary,
    /Grade\(int\)/,
  );
  assert.match(
    explainError("error CS0029: Cannot implicitly convert type 'string' to 'int'", "cs").hint,
    /int\.Parse/,
  );
  assert.match(
    explainError("Unhandled exception. System.NullReferenceException: Object reference not set", "cs").summary,
    /null/,
  );
  // An unrecognised compiler code still beats printing nothing helpful.
  assert.match(
    explainError("error CS8321: The local function 'Helper' is declared but never used", "cs").summary,
    /rejected this code/,
  );
  assert.match(
    explainError("ReferenceError: totl is not defined").summary,
    /totl/,
  );
  assert.match(
    explainError("TypeError: numbers.mapp is not a function").summary,
    /numbers\.mapp/,
  );
  assert.match(
    explainError("TypeError: Cannot read properties of undefined (reading 'name')").summary,
    /undefined/,
  );
  assert.match(
    explainError("TypeError: Cannot read property 'name' of null").summary,
    /null/,
  );
  assert.match(explainError("SyntaxError: Unexpected end of input").hint, /closing partner/);
  assert.match(explainError("TypeError: Assignment to constant variable.").hint, /`let`/);
});

test("an unrecognised message is reported verbatim rather than guessed at", () => {
  assert.equal(explainError("Something entirely unexpected happened"), null);
  assert.equal(explainError(""), null);
  assert.equal(explainError(undefined), null);
  assert.equal(explainError(null, "cs"), null);
});

test("a runtime's own errors are explained even when the other language is named", () => {
  // The C# runner surfaces JavaScript-shaped messages from the harness, and the
  // playground runs both languages, so neither list may be skipped.
  assert.ok(explainError("ReferenceError: total is not defined", "cs"));
  assert.ok(explainError("error CS1002: ; expected", "js"));
});
