import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createStore, SESSION_MS } from "../sync/store.mjs";
import { freshState } from "../public/core.js";

async function withStore(run, { now } = {}) {
  const dir = await mkdtemp(join(tmpdir(), "forge-sync-"));
  try {
    await run(createStore({ dir, now }), dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("an account round-trips and the address cannot be claimed twice", async () => {
  await withStore(async (store) => {
    assert.equal(await store.getAccount("a@example.com"), null);
    const made = await store.createAccount("a@example.com", "hash", freshState());
    assert.equal(made.email, "a@example.com");
    assert.equal(made.revision, 1);
    assert.deepEqual((await store.getAccount("a@example.com")).state, freshState());
    assert.equal(await store.createAccount("a@example.com", "other", freshState()), null);
    // The rejected signup must not have replaced the stored credential.
    assert.equal((await store.getAccount("a@example.com")).password, "hash");
  });
});

test("simultaneous signups for one address produce a single account", async () => {
  await withStore(async (store) => {
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, i) => store.createAccount("race@example.com", `hash${i}`, freshState())),
    );
    assert.equal(results.filter(Boolean).length, 1);
  });
});

test("concurrent writes queue instead of overwriting each other's merge", async () => {
  await withStore(async (store) => {
    await store.createAccount("b@example.com", "hash", freshState());
    // Each writer reads, waits, then adds one. Without the per-account lock both
    // would read the same value and the second would discard the first's work.
    const bump = () => store.updateAccount("b@example.com", async (account) => {
      const seconds = account.state.focusSeconds;
      await new Promise(resolve => setTimeout(resolve, 5));
      return { state: { ...account.state, focusSeconds: seconds + 1 } };
    });
    await Promise.all([bump(), bump(), bump(), bump(), bump()]);
    const account = await store.getAccount("b@example.com");
    assert.equal(account.state.focusSeconds, 5);
    assert.equal(account.revision, 6);
  });
});

test("writing leaves no partial or temporary files behind", async () => {
  await withStore(async (store, dir) => {
    await store.createAccount("c@example.com", "hash", freshState());
    await store.updateAccount("c@example.com", (account) => ({ state: { ...account.state, goal: 60 } }));
    const files = await readdir(join(dir, "accounts"));
    assert.equal(files.length, 1);
    assert.equal(files.every(name => name.endsWith(".json")), true);
  });
});

test("an unknown account cannot be updated into existence", async () => {
  await withStore(async (store) => {
    assert.equal(await store.updateAccount("ghost@example.com", () => ({ state: freshState() })), null);
    assert.equal(await store.getAccount("ghost@example.com"), null);
  });
});

test("a damaged record reads as absent rather than throwing", async () => {
  await withStore(async (store, dir) => {
    await store.createAccount("d@example.com", "hash", freshState());
    const [name] = await readdir(join(dir, "accounts"));
    await writeFile(join(dir, "accounts", name), "{ not json", "utf8");
    assert.equal(await store.getAccount("d@example.com"), null);
  });
});

test("a session resolves to its owner and stops resolving once revoked", async () => {
  await withStore(async (store) => {
    const token = await store.createSession("e@example.com");
    assert.equal(await store.readSession(token), "e@example.com");
    assert.equal(await store.readSession("not-a-real-token"), null);
    await store.deleteSession(token);
    assert.equal(await store.readSession(token), null);
  });
});

test("the raw session token is never written to disk", async () => {
  await withStore(async (store, dir) => {
    const token = await store.createSession("f@example.com");
    const files = await readdir(join(dir, "sessions"));
    assert.equal(files.length, 1);
    // Someone who reads the data directory must not come away with a usable cookie.
    assert.equal(files[0].includes(token), false);
    assert.match(files[0], /^[0-9a-f]{64}\.json$/);
  });
});

test("an expired session is refused and swept, while an active one slides forward", async () => {
  let clock = 1_000_000;
  await withStore(async (store, dir) => {
    const token = await store.createSession("g@example.com");
    clock += SESSION_MS + 1;
    assert.equal(await store.readSession(token), null);
    assert.deepEqual(await readdir(join(dir, "sessions")), []);

    const fresh = await store.createSession("g@example.com");
    // Past the halfway mark the expiry is pushed out, so an active learner is
    // not signed out mid-session.
    clock += SESSION_MS * 0.75;
    assert.equal(await store.readSession(fresh), "g@example.com");
    clock += SESSION_MS * 0.75;
    assert.equal(await store.readSession(fresh), "g@example.com");
  }, { now: () => clock });
});

test("the sweep clears sessions of devices that never came back", async () => {
  let clock = 1_000_000;
  await withStore(async (store, dir) => {
    await store.createSession("h@example.com");
    await store.createSession("i@example.com");
    const keep = (clock += SESSION_MS - 1000, await store.createSession("j@example.com"));
    clock += 2000;
    assert.equal(await store.purgeExpired(), 2);
    assert.equal((await readdir(join(dir, "sessions"))).length, 1);
    assert.equal(await store.readSession(keep), "j@example.com");
  }, { now: () => clock });
});
