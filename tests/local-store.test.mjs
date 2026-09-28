import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { resolve } from "./resolve-ts.mjs";
import { freshState, STORAGE_KEY } from "../public/core.js";

// The store under test is TypeScript with extensionless imports; this hook lets
// Node's native type-stripping load it (see resolve-ts.mjs). Registered before the
// dynamic import below so `./core` resolves.
registerHooks({ resolve });
const { createLocalStore, BACKUP_KEY, IMPORT_BACKUP_KEY, BEFORE_SYNC_KEY } = await import(
  "../web/src/lib/progress/local-store.ts"
);

// A fake localStorage + Web Locks pair, matching the vanilla progress-store test
// harness so the two durability layers are checked against the same contract.
function environment(initial = freshState()) {
  const values = new Map([[STORAGE_KEY, JSON.stringify(initial)]]);
  let tail = Promise.resolve();
  let failingKey;
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem(key, value) {
      if (key === failingKey) throw new DOMException("Quota exceeded", "QuotaExceededError");
      values.set(key, value);
    },
  };
  const locks = {
    request(_name, work) {
      const job = tail.then(work);
      tail = job.catch(() => {});
      return job;
    },
  };
  return {
    values,
    tab: (options = {}) => createLocalStore({ storage: () => storage, locks, ...options }),
    saved: () => JSON.parse(values.get(STORAGE_KEY)),
    fail: (key) => { failingKey = key; },
  };
}

test("a corrupt primary record recovers from the .recovery backup", async () => {
  const initial = freshState();
  initial.notes.scratchpad = "recover me";
  const env = environment(initial);
  const tab = env.tab();
  const edit = tab.state;
  edit.goal = 60;
  await tab.save(edit); // establishes .recovery = the pre-edit record
  env.values.set(STORAGE_KEY, "{broken");
  const reopened = env.tab();
  assert.equal(reopened.state.notes.scratchpad, "recover me");
  assert.equal(reopened.recovered, true);
  assert.match(reopened.problem, /recovered/);
});

test("read falls back to .before-import when primary and .recovery are both unusable", () => {
  const good = freshState();
  good.notes.scratchpad = "import backup";
  const env = environment();
  env.values.set(STORAGE_KEY, "{broken");
  env.values.set(BACKUP_KEY, "also broken");
  env.values.set(IMPORT_BACKUP_KEY, JSON.stringify(good));
  const tab = env.tab();
  assert.equal(tab.state.notes.scratchpad, "import backup");
  assert.equal(tab.recovered, true);
});

test("the valid previous save is copied to .recovery before the primary is overwritten", async () => {
  const initial = freshState();
  initial.notes.scratchpad = "original";
  const env = environment(initial);
  const tab = env.tab();
  const edit = tab.state;
  edit.notes.scratchpad = "updated";
  assert.equal(await tab.save(edit), true);
  assert.equal(env.saved().notes.scratchpad, "updated");
  assert.equal(JSON.parse(env.values.get(BACKUP_KEY)).notes.scratchpad, "original");
});

test("a full quota surfaces the export-before-closing message and keeps the edit", async () => {
  const env = environment();
  const tab = env.tab();
  env.fail(STORAGE_KEY);
  const edit = tab.state;
  edit.notes.scratchpad = "do not lose this";
  assert.equal(await tab.save(edit), false);
  assert.match(tab.problem, /storage is full/i);
  assert.equal(tab.state.notes.scratchpad, "do not lose this");
  env.fail(null);
  assert.equal(await tab.save(tab.state), true);
  assert.equal(env.saved().notes.scratchpad, "do not lose this");
});

test("a record restored in another tab is detected and the stale edit is preserved", async () => {
  const initial = freshState();
  initial.notes.scratchpad = "before";
  const env = environment(initial);
  const a = env.tab();
  const b = env.tab();
  const imported = freshState();
  imported.notes.scratchpad = "after import";
  assert.equal(await a.replace(imported), true); // stamps a fresh _generation
  const stale = b.state;
  stale.notes.other = "stale work";
  assert.equal(await b.save(stale), false);
  assert.match(b.problem, /restored in another tab/);
  assert.equal(env.saved().notes.other, undefined);
  assert.equal(b.state.notes.other, "stale work");
});

test("import keeps the prior record in .before-import", async () => {
  const initial = freshState();
  initial.notes.scratchpad = "pre import";
  const env = environment(initial);
  const tab = env.tab();
  const imported = freshState();
  imported.notes.scratchpad = "imported";
  assert.equal(await tab.replace(imported), true);
  assert.equal(env.saved().notes.scratchpad, "imported");
  assert.equal(JSON.parse(env.values.get(IMPORT_BACKUP_KEY)).notes.scratchpad, "pre import");
  assert.equal(JSON.parse(tab.backup("before-import")).notes.scratchpad, "pre import");
});

test("snapshotBeforeSync copies the live record to .before-sync", () => {
  const initial = freshState();
  initial.notes.scratchpad = "device only";
  const env = environment(initial);
  const tab = env.tab();
  tab.snapshotBeforeSync();
  assert.equal(JSON.parse(env.values.get(BEFORE_SYNC_KEY)).notes.scratchpad, "device only");
  assert.equal(JSON.parse(tab.backup("before-sync")).notes.scratchpad, "device only");
});

test("a server-authoritative write stamps a fresh _generation and stays consistent", async () => {
  const env = environment();
  const tab = env.tab();
  const server = freshState();
  server.notes.a = "from server";
  const written = await tab.write(server);
  assert.equal(written.notes.a, "from server");
  assert.equal(env.saved().notes.a, "from server");
  assert.ok(env.saved()._generation);
  assert.notEqual(env.saved()._generation, "legacy");
  const edit = tab.state;
  edit.goal = 90;
  assert.equal(await tab.save(edit), true); // generation adopted, no false conflict
  assert.equal(env.saved().goal, 90);
});

test("a recovered record can be saved without another edit, then the flag clears", async () => {
  const env = environment();
  const good = freshState();
  good.notes.scratchpad = "recovery copy";
  env.values.set(BACKUP_KEY, JSON.stringify(good));
  env.values.set(STORAGE_KEY, "broken");
  const tab = env.tab();
  assert.equal(tab.recovered, true);
  assert.equal(await tab.save(tab.state), true);
  assert.equal(env.saved().notes.scratchpad, "recovery copy");
  await tab.sync();
  assert.equal(tab.problem, "");
});

test("unrecoverable data is never overwritten by a save, but an import replaces it", async () => {
  const env = environment();
  env.values.set(STORAGE_KEY, "totally broken");
  const tab = env.tab();
  const edit = tab.state;
  edit.notes.scratchpad = "new work";
  assert.equal(await tab.save(edit), false);
  assert.equal(env.values.get(STORAGE_KEY), "totally broken");
  assert.equal(tab.state.notes.scratchpad, "new work");
  const imported = freshState();
  imported.notes.scratchpad = "restored";
  assert.equal(await tab.replace(imported), true);
  assert.equal(env.values.get(IMPORT_BACKUP_KEY), "totally broken");
  assert.equal(env.saved().notes.scratchpad, "restored");
});
