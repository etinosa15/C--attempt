import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
const source = await readFile(new URL("../public/runner-worker.js", import.meta.url), "utf8");
async function run(code, tests = []) {
  let result;
  const context = vm.createContext({ self: { postMessage: value => { result = JSON.parse(JSON.stringify(value)); } } });
  vm.runInContext(source, context);
  await context.self.onmessage({ data: { code, tests } });
  return result;
}
test("worker reports null and primitive thrown values without timing out", async () => {
  assert.equal((await run("throw null;")).error, "Thrown value: null");
  assert.equal((await run('throw "try again";')).error, "Thrown value: try again");
  assert.match((await run('throw new Error("bad input");')).error, /bad input/);
});
test("playground accepts top-level return, while challenges cannot skip checks", async () => {
  const plain = await run('console.log("done"); return 42;');
  assert.deepEqual(plain.logs, ["done"]);
  assert.deepEqual(plain.results, []);
  assert.equal(plain.error, undefined);
  const checks = [{ label: "one", expression: "answer()", expected: 1 }];
  assert.match((await run("return; function answer() {return 1}", checks)).error, /before all checks/);
  assert.equal((await run("function answer() {return 1}", checks)).results[0].passed, true);
});
