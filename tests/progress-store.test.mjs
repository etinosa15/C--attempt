import test from "node:test";
import assert from "node:assert/strict";
import { freshState, STORAGE_KEY } from "../public/core.js";
import { createProgressStore, BACKUP_KEY, IMPORT_BACKUP_KEY } from "../public/progress-store.js";

function environment(initial = freshState()) {
  const values = new Map([[STORAGE_KEY, JSON.stringify(initial)]]);
  let tail = Promise.resolve();
  let failingKey;
  const storage = {
    getItem: key => values.get(key) ?? null,
    setItem(key, value) {
      if (key === failingKey) throw new DOMException("Quota exceeded", "QuotaExceededError");
      values.set(key, value);
    },
  };
  const locks = { request(_name, work) {
    const job = tail.then(work);
    tail = job.catch(() => {});
    return job;
  } };
  return {
    values, storage, locks,
    tab: (options = {}) => createProgressStore({ storage: () => storage, locks, ...options }),
    saved: () => JSON.parse(values.get(STORAGE_KEY)),
    fail: key => { failingKey = key; },
  };
}

test("concurrent tabs preserve independent notes, achievements and timer increments", async () => {
  const env = environment();
  const a = env.tab(), b = env.tab();
  const first = a.state, second = b.state;
  first.notes.a = "first note";
  first.completed.push("js-values");
  first.activity["2026-09-13"] = 1;
  first.focusSeconds = 15;
  second.notes.b = "second note";
  second.solved.push("cs-types");
  second.activity["2026-09-13"] = 1;
  second.focusSeconds = 30;
  assert.deepEqual(await Promise.all([a.save(first), b.save(second)]), [true, true]);
  await a.sync();
  assert.deepEqual(a.state, b.state);
  assert.deepEqual(a.state.notes, { a: "first note", b: "second note" });
  assert.deepEqual(a.state.completed, ["js-values"]);
  assert.deepEqual(a.state.solved, ["cs-types"]);
  assert.equal(a.state.activity["2026-09-13"], 2);
  assert.equal(a.state.focusSeconds, 45);
});

test("different project milestones merge, including an unchecked milestone", async () => {
  const initial = freshState();
  initial.projectChecks.habit = [0];
  const env = environment(initial);
  const a = env.tab(), b = env.tab();
  const first = a.state, second = b.state;
  first.projectChecks.habit = [0, 1];
  second.projectChecks.habit = [];
  await Promise.all([a.save(first), b.save(second)]);
  assert.deepEqual(env.saved().projectChecks.habit, [1]);
});

test("conflicting draft edits keep both the saved version and the unsaved local version", async () => {
  const initial = freshState();
  initial.drafts["play-js"] = "original";
  const env = environment(initial);
  const a = env.tab(), b = env.tab();
  const first = a.state, second = b.state;
  first.drafts["play-js"] = "tab one";
  second.drafts["play-js"] = "tab two";
  await a.save(first);
  assert.equal(await b.save(second), false);
  await b.sync();
  assert.equal(env.saved().drafts["play-js"], "tab one");
  assert.equal(b.state.drafts["play-js"], "tab two");
  assert.equal(b.unsaved, true);
  assert.match(b.problem, /changed in another tab/);
});

test("rapid local edits are committed once without duplicating activity", async () => {
  const env = environment();
  const tab = env.tab();
  const next = tab.state;
  next.notes.scratchpad = "h";
  next.activity["2026-09-13"] = 1;
  const first = tab.save(next);
  next.notes.scratchpad = "hello";
  next.activity["2026-09-13"] = 2;
  const second = tab.save(next);
  await Promise.all([first, second]);
  assert.equal(env.saved().notes.scratchpad, "hello");
  assert.equal(env.saved().activity["2026-09-13"], 2);
});

for (const key of [STORAGE_KEY, BACKUP_KEY]) {
  test(`a failed ${key === STORAGE_KEY ? "save" : "backup"} preserves edits and can be retried`, async () => {
    const env = environment();
    const tab = env.tab();
    env.fail(key);
    const next = tab.state;
    next.notes.scratchpad = "Do not lose this";
    next.focusSeconds = 15;
    assert.equal(await tab.save(next), false);
    assert.equal(env.saved().notes.scratchpad, undefined);
    assert.equal(tab.state.notes.scratchpad, "Do not lose this");
    assert.match(tab.problem, /storage is full/);
    env.fail(null);
    assert.equal(await tab.save(tab.state), true);
    assert.equal(env.saved().notes.scratchpad, "Do not lose this");
    assert.equal(env.saved().focusSeconds, 15);
    assert.equal(tab.unsaved, false);
  });
}

test("corrupt primary data recovers the previous valid save", async () => {
  const initial = freshState();
  initial.notes.scratchpad = "recover me";
  const env = environment(initial);
  const tab = env.tab();
  const next = tab.state;
  next.goal = 60;
  await tab.save(next);
  env.values.set(STORAGE_KEY, "{broken");
  const reopened = env.tab();
  assert.equal(reopened.state.notes.scratchpad, "recover me");
  assert.match(reopened.problem, /recovered/);
  const edit = reopened.state;
  edit.goal = 90;
  assert.equal(await reopened.save(edit), true);
  assert.equal(env.saved().notes.scratchpad, "recover me");
});

test("unrecoverable data is not overwritten by automatic saves", async () => {
  const env = environment();
  env.values.set(STORAGE_KEY, "broken original");
  const tab = env.tab();
  const edit = tab.state;
  edit.notes.scratchpad = "new work";
  assert.equal(await tab.save(edit), false);
  assert.equal(env.values.get(STORAGE_KEY), "broken original");
  assert.equal(tab.state.notes.scratchpad, "new work");
  const imported = freshState();
  imported.notes.scratchpad = "restored";
  assert.equal(await tab.replace(imported), true);
  assert.equal(env.values.get(IMPORT_BACKUP_KEY), "broken original");
  assert.equal(env.saved().notes.scratchpad, "restored");
});

test("recovered progress can be saved without another edit", async () => {
  const env = environment();
  const good = freshState();
  good.notes.scratchpad = "recovery copy";
  env.values.set(BACKUP_KEY, JSON.stringify(good));
  env.values.set(STORAGE_KEY, "broken");
  const tab = env.tab();
  assert.equal(await tab.save(tab.state), true);
  assert.equal(env.saved().notes.scratchpad, "recovery copy");
  await tab.sync();
  assert.equal(tab.problem, "");
});

test("storage access restored after startup can save local edits without losing existing progress", async () => {
  const initial = freshState();
  initial.notes.original = "existing work";
  initial._generation = "previous-import";
  const env = environment(initial);
  let denied = true;
  const tab = env.tab({ storage: () => {
    if (denied) throw new Error("Storage denied");
    return env.storage;
  } });
  const next = tab.state;
  next.notes.new = "local work";
  assert.equal(await tab.save(next), false);
  denied = false;
  assert.equal(await tab.save(tab.state), true);
  assert.deepEqual(env.saved().notes, { original: "existing work", new: "local work" });
});

test("import keeps a separate backup and stale tabs cannot undo it", async () => {
  const initial = freshState();
  initial.notes.scratchpad = "before import";
  const env = environment(initial);
  const a = env.tab(), b = env.tab(), idle = env.tab();
  const imported = freshState();
  imported.notes.scratchpad = "after import";
  assert.equal(await a.replace(imported), true);
  const stale = b.state;
  stale.notes.other = "unsaved old tab";
  assert.equal(await b.save(stale), false);
  assert.match(b.problem, /restored in another tab/);
  assert.equal(env.saved().notes.other, undefined);
  assert.equal(b.state.notes.other, "unsaved old tab");
  await idle.sync();
  assert.equal(idle.state.notes.scratchpad, "after import");
  const edit = a.state;
  edit.goal = 90;
  await a.save(edit);
  assert.equal(JSON.parse(a.backup("before-import")).notes.scratchpad, "before import");
});

test("failed import leaves the current progress and view intact", async () => {
  const env = environment();
  const tab = env.tab();
  env.fail(STORAGE_KEY);
  const imported = freshState();
  imported.goal = 90;
  assert.equal(await tab.replace(imported), false);
  assert.equal(tab.state.goal, 30);
  assert.equal(env.saved().goal, 30);
});

test("dismissing the welcome panel and exporting in different tabs both survive", async () => {
  const env = environment();
  const a = env.tab(), b = env.tab();
  const first = a.state, second = b.state;
  first.onboarded = true;
  second.lastExport = 1757808000000;
  second.notes.scratchpad = "still writing";
  assert.deepEqual(await Promise.all([a.save(first), b.save(second)]), [true, true]);
  await a.sync();
  assert.equal(env.saved().onboarded, true);
  assert.equal(env.saved().lastExport, 1757808000000);
  assert.equal(a.state.notes.scratchpad, "still writing");
  // A later export in either tab replaces the timestamp rather than summing it.
  const later = b.state;
  later.lastExport = 1757894400000;
  await b.save(later);
  await a.sync();
  assert.equal(a.state.lastExport, 1757894400000);
});

test("a saved record reports when it last reached storage", async () => {
  const env = environment();
  const tab = env.tab();
  assert.equal(tab.lastSaved, null);
  const edit = tab.state;
  edit.notes.scratchpad = "first";
  await tab.save(edit);
  const written = tab.lastSaved;
  assert.ok(Number.isFinite(written));
  // A save with nothing to write must not claim a fresh write.
  await tab.save(tab.state);
  assert.equal(tab.lastSaved, written);
  // A failed write must not either.
  env.fail(STORAGE_KEY);
  const second = tab.state;
  second.notes.scratchpad = "second";
  assert.equal(await tab.save(second), false);
  assert.equal(tab.lastSaved, written);
});

test("storage unavailable and unsupported coordination never report successful saves", async () => {
  const env = environment();
  const unsupported = env.tab({ locks: null });
  const edit = unsupported.state;
  edit.goal = 60;
  assert.equal(await unsupported.save(edit), false);
  assert.match(unsupported.problem, /unavailable/);
  assert.equal(unsupported.lastSaved, null);
  const denied = env.tab({ storage: () => { throw new Error("Storage denied"); } });
  const note = denied.state;
  note.notes.scratchpad = "in memory";
  assert.equal(await denied.save(note), false);
  assert.equal(denied.state.notes.scratchpad, "in memory");
});

test("two tabs share one timer and cannot double-count the same session", async () => {
  const env = environment();
  const a = env.tab(), b = env.tab();
  const start = new Date(2026, 8, 13, 12).getTime();
  await Promise.all([a.focus("start", start), b.focus("start", start)]);
  await Promise.all([a.focus("tick", start + 60000), b.focus("tick", start + 60000)]);
  assert.equal(env.saved().focusSeconds, 60);
  assert.equal(env.saved().focusByDay["2026-09-13"], 60);
  assert.equal(env.saved().focusTimer.remainingMs, 1440000);
  await a.focus("pause", start + 90000);
  await b.focus("tick", start + 120000);
  assert.equal(env.saved().focusSeconds, 90);
  assert.equal(b.state.focusTimer.accountedAt, null);
});

test("stale note saves preserve the shared timer and failed checkpoints retry exactly once", async () => {
  const env = environment();
  const a = env.tab(), b = env.tab();
  const start = new Date(2026, 8, 13, 12).getTime();
  await a.focus("start", start);
  const edit = b.state;
  edit.notes.scratchpad = "practice";
  await b.save(edit);
  assert.equal(env.saved().focusTimer.accountedAt, start);
  env.fail(STORAGE_KEY);
  assert.equal(await a.focus("tick", start + 30000), false);
  assert.equal(env.saved().focusSeconds, 0);
  env.fail(null);
  await a.focus("tick", start + 45000);
  assert.equal(env.saved().focusSeconds, 45);
  assert.equal(env.saved().notes.scratchpad, "practice");
});

test("a saved running timer resumes after reopening but importing restores it paused", async () => {
  const env = environment();
  const a = env.tab();
  const start = new Date(2026, 8, 13, 12).getTime();
  await a.focus("start", start);
  await a.focus("tick", start + 60000);
  const reopened = env.tab();
  await reopened.focus("tick", start + 120000);
  assert.equal(reopened.state.focusSeconds, 120);
  await reopened.replace(reopened.state);
  await reopened.focus("tick", start + 86400000);
  assert.equal(reopened.state.focusSeconds, 120);
  assert.equal(reopened.state.focusTimer.accountedAt, null);
});
