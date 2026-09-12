import assert from "node:assert/strict";
import vm from "node:vm";
import { lessons } from "../public/curriculum.js";
import { executeCSharp, findDotnet } from "../server.mjs";
const sdk = await findDotnet();
let count = 0;
for (const lesson of lessons) {
  if (lesson.lang === "js") {
    const expression =
      "(async()=>{" +
      lesson.challenge.solution +
      "\nreturn await Promise.all([" +
      lesson.challenge.tests
        .map((t) => `(async()=>await (${t.expression}))()`)
        .join(",") +
      "]);})()";
    const actual = await vm.runInNewContext(
      expression,
      { console, setTimeout, clearTimeout },
      { timeout: 2000 },
    );
    lesson.challenge.tests.forEach((t, i) =>
      assert.deepEqual(
        JSON.parse(JSON.stringify(actual[i])),
        t.expected,
        lesson.id + ": " + t.label,
      ),
    );
  } else {
    assert.ok(sdk, "C# verification requires an installed .NET SDK");
    const result = await executeCSharp(
      lesson.challenge.solution,
      lesson.challenge.tests,
      sdk,
    );
    assert.equal(result.error, undefined, lesson.id + ": " + result.error);
    assert.equal(result.results.length, lesson.challenge.tests.length);
    for (const r of result.results)
      assert.ok(r.passed, lesson.id + ": " + JSON.stringify(r));
  }
  count += lesson.challenge.tests.length;
  console.log(
    "PASS " + lesson.id + " (" + lesson.challenge.tests.length + " cases)",
  );
}
console.log(
  `Verified ${count} executable test cases across all ${lessons.length} lessons.`,
);
