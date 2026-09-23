import test from "node:test";
import assert from "node:assert/strict";
import { indentOnEnter } from "../public/core.js";

// Apply the transformation the way bindEditor does, so tests exercise the same
// result the textarea would show: replace [start, end] with text, caret at start+caret.
function apply(value, start, end = start) {
  const { text, caret } = indentOnEnter(value, start, end);
  return {
    value: value.slice(0, start) + text + value.slice(end),
    caret: start + caret,
  };
}

test("plain Enter preserves the current line's indentation", () => {
  const src = "    let x = 1;";
  const out = apply(src, src.length);
  assert.equal(out.value, "    let x = 1;\n    ");
  assert.equal(out.caret, out.value.length);
});

test("Enter at column 0 adds no indentation", () => {
  const out = apply("let x = 1;", 0);
  assert.equal(out.value, "\nlet x = 1;");
  assert.equal(out.caret, 1);
});

test("Enter after an opening brace adds one level", () => {
  const src = "  if (ok) {";
  const out = apply(src, src.length);
  assert.equal(out.value, "  if (ok) {\n    ");
  assert.equal(out.caret, out.value.length);
});

test("Enter after an opening paren or bracket also indents", () => {
  for (const open of ["(", "["]) {
    const src = "items" + open;
    const out = apply(src, src.length);
    assert.equal(out.value, "items" + open + "\n  ");
  }
});

test("Enter inside an empty pair splits across three lines with the caret between", () => {
  const src = "  method() {}";
  const braceOpen = src.indexOf("{") + 1; // caret sits between { and }
  const out = apply(src, braceOpen);
  assert.equal(out.value, "  method() {\n    \n  }");
  // Caret lands on the indented middle line, after its four spaces.
  assert.equal(out.value.slice(0, out.caret), "  method() {\n    ");
});

test("tab-character indentation is preserved verbatim", () => {
  const src = "\t\tvalue = 2;";
  const out = apply(src, src.length);
  assert.equal(out.value, "\t\tvalue = 2;\n\t\t");
});

test("a selection is replaced by the newline and indent", () => {
  const src = "  keep DROP tail";
  const start = src.indexOf("DROP");
  const end = start + "DROP".length;
  const out = apply(src, start, end);
  assert.equal(out.value, "  keep \n   tail");
});
