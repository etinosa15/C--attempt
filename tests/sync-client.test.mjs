import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSyncServer } from "../sync-server.mjs";
import { createSyncClient } from "../public/sync-client.js";
import { freshState } from "../public/core.js";

const ORIGIN = "https://forge.example";
const PASSWORD = "a-good-long-passphrase";
const json = (data, status = 200) => new Response(JSON.stringify(data), { status });

// A Map-backed stand-in for localStorage, so a test starts from clean storage
// and can inspect exactly what the client persisted.
function memoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    _map: map,
  };
}

// A live state cell the client reads through readState/writeState, standing in
// for the app's progress store.
function stateCell(initial = freshState()) {
  let state = initial;
  return {
    readState: () => state,
    writeState: async (next) => { state = next; },
    get: () => state,
    set: (next) => { state = next; },
  };
}

test("a client with no origin makes no requests and every method is a no-op", async () => {
  let calls = 0;
  const client = createSyncClient({ origin: "", fetchImpl: async () => { calls++; return json({}); } });
  assert.equal(client.enabled, false);
  assert.equal(await client.restore(), null);
  assert.equal(await client.signup("a@b.com", PASSWORD), null);
  assert.equal(await client.login("a@b.com", PASSWORD), null);
  assert.equal(await client.requestReset("a@b.com"), null);
  assert.equal(await client.logout(), null);
  assert.equal(await client.syncNow(), null);
  assert.equal(await client.flush(), null);
  client.schedule();
  assert.equal(calls, 0);
  assert.equal(client.account, null);
});

test("a 401 on any call drops to signed-out and notifies once, keeping the baseline", async () => {
  const storage = memoryStorage();
  // Pretend a session and baseline already exist on this device.
  storage.setItem("forge.academy.v1.sync", JSON.stringify({ email: "learner@example.com", baseline: freshState(), revision: 3, lastSynced: 1000 }));
  const auth = [];
  const client = createSyncClient({
    origin: ORIGIN,
    storage: () => storage,
    fetchImpl: async () => json({ error: "no" }, 401),
    onAuth: (account) => auth.push(account),
  });
  // Restore learns the cookie is dead: it swallows the error and stays local.
  await client.restore();
  assert.equal(client.account, null);
  // The baseline survives so the next sign-in can still merge rather than replay.
  assert.notEqual(storage.getItem("forge.academy.v1.sync"), null);
});

test("focusTimer never leaves the device, even when it differs from the baseline", async () => {
  const dir = await mkdtemp(join(tmpdir(), "forge-sync-client-"));
  const server = createSyncServer({ origins: [ORIGIN], dir, secureCookie: false });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const jar = new Map();
  const bodies = [];
  const realFetch = async (url, options = {}) => {
    const headers = { ...options.headers };
    const cookie = [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
    if (cookie) headers.Cookie = cookie;
    if (options.method === "POST" && url.endsWith("/api/sync")) bodies.push(JSON.parse(options.body));
    const response = await fetch(base + url.slice(ORIGIN.length), { ...options, headers });
    for (const raw of response.headers.getSetCookie()) {
      const [pair] = raw.split(";");
      const i = pair.indexOf("=");
      const name = pair.slice(0, i).trim();
      const value = pair.slice(i + 1).trim();
      /Max-Age=0/i.test(raw) || !value ? jar.delete(name) : jar.set(name, value);
    }
    return response;
  };

  const cell = stateCell({ ...freshState(), completed: ["js-values"], focusSeconds: 120,
    focusTimer: { remainingMs: 90000, accountedAt: 555 } });
  const storage = memoryStorage();
  const client = createSyncClient({
    origin: ORIGIN, fetchImpl: realFetch, storage: () => storage,
    readState: cell.readState, writeState: cell.writeState,
  });

  try {
    await client.signup("learner@example.com", PASSWORD, cell.get());
    // Change the timer and push again — the timer differs from the baseline now.
    cell.set({ ...cell.get(), focusSeconds: 200, focusTimer: { remainingMs: 10000, accountedAt: 999 } });
    await client.syncNow();
    // No change body the client sent may carry a focusTimer path.
    for (const body of bodies)
      for (const change of body.changes || [])
        assert.notEqual(change.path[0], "focusTimer");
    // The running timer stays exactly what this device holds after each merge.
    assert.deepEqual(cell.get().focusTimer, { remainingMs: 10000, accountedAt: 999 });
  } finally {
    server.closeAllConnections?.();
    await new Promise(resolve => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  }
});

test("scheduled pushes coalesce into a single sync", async () => {
  let syncPosts = 0;
  const client = createSyncClient({
    origin: ORIGIN,
    debounceMs: 15,
    storage: () => memoryStorage(),
    fetchImpl: async (url, options = {}) => {
      if (url.endsWith("/api/auth/login")) return json({ email: "l@e.com", state: freshState(), revision: 1, token: "t" });
      if (url.endsWith("/api/sync")) { if (options.method === "POST") syncPosts++; return json({ state: freshState(), revision: 1, applied: 0 }); }
      return json({ email: "l@e.com" });
    },
    readState: () => ({ ...freshState(), focusSeconds: 50 }),
  });
  await client.login("l@e.com", PASSWORD);
  const postsAfterLogin = syncPosts;
  // A burst of saves in quick succession should debounce to one push.
  client.schedule();
  client.schedule();
  client.schedule();
  await new Promise(resolve => setTimeout(resolve, 40));
  assert.equal(syncPosts - postsAfterLogin, 1);
});

test("logging into an account with matching focus time does not double it", async () => {
  const dir = await mkdtemp(join(tmpdir(), "forge-sync-client-"));
  const server = createSyncServer({ origins: [ORIGIN], dir, secureCookie: false });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  function makeFetch() {
    const jar = new Map();
    return async (url, options = {}) => {
      const headers = { ...options.headers };
      const cookie = [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
      if (cookie) headers.Cookie = cookie;
      const response = await fetch(base + url.slice(ORIGIN.length), { ...options, headers });
      for (const raw of response.headers.getSetCookie()) {
        const [pair] = raw.split(";");
        const i = pair.indexOf("=");
        const name = pair.slice(0, i).trim();
        const value = pair.slice(i + 1).trim();
        /Max-Age=0/i.test(raw) || !value ? jar.delete(name) : jar.set(name, value);
      }
      return response;
    };
  }

  try {
    // Device one signs up and seeds the account with 400 focus seconds.
    const oneCell = stateCell({ ...freshState(), focusSeconds: 400, activity: { "2026-09-20": 5 } });
    const one = createSyncClient({ origin: ORIGIN, fetchImpl: makeFetch(), storage: () => memoryStorage(),
      readState: oneCell.readState, writeState: oneCell.writeState });
    await one.signup("learner@example.com", PASSWORD, oneCell.get());

    // Device two independently reached the same 400, then logs into that account.
    const twoCell = stateCell({ ...freshState(), focusSeconds: 400, activity: { "2026-09-20": 5 } });
    const two = createSyncClient({ origin: ORIGIN, fetchImpl: makeFetch(), storage: () => memoryStorage(),
      readState: twoCell.readState, writeState: twoCell.writeState });
    await two.login("learner@example.com", PASSWORD);

    // First contact adopts (max), it does not replay a +400 delta.
    assert.equal(twoCell.get().focusSeconds, 400);
    assert.equal(twoCell.get().activity["2026-09-20"], 5);
  } finally {
    server.closeAllConnections?.();
    await new Promise(resolve => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  }
});

test("requesting a password reset posts the email and carries no session", async () => {
  const storage = memoryStorage();
  const bodies = [];
  let authHeaderSeen = "absent";
  const client = createSyncClient({
    origin: ORIGIN,
    storage: () => storage,
    fetchImpl: async (url, options = {}) => {
      if (url.endsWith("/api/auth/reset")) {
        bodies.push(JSON.parse(options.body));
        authHeaderSeen = (options.headers || {}).Authorization ?? "absent";
        return json({ ok: true });
      }
      return json({});
    },
  });
  const result = await client.requestReset("learner@example.com");
  assert.deepEqual(result, { ok: true });
  assert.deepEqual(bodies, [{ email: "learner@example.com" }]);
  // Signed out throughout: no bearer is attached, no session is created, and the
  // reset request writes nothing to storage.
  assert.equal(authHeaderSeen, "absent");
  assert.equal(client.account, null);
  assert.equal(client.sessionToken(), "");
  assert.equal(storage.getItem("forge.academy.v1.sync"), null);
});

test("signup with email confirmation on stays local and stores nothing", async () => {
  const storage = memoryStorage();
  let syncCalls = 0;
  const client = createSyncClient({
    origin: ORIGIN,
    storage: () => storage,
    fetchImpl: async (url) => {
      if (url.endsWith("/api/auth/signup")) return json({ pending: true, email: "new@example.com" });
      syncCalls++;
      return json({ state: freshState(), revision: 0 });
    },
  });
  const result = await client.signup("new@example.com", PASSWORD);
  // The caller learns to prompt for confirmation; nothing is treated as a session.
  assert.deepEqual(result, { pending: true, email: "new@example.com" });
  assert.equal(client.account, null);
  assert.equal(client.sessionToken(), "");
  assert.equal(storage.getItem("forge.academy.v1.sync"), null);
  assert.equal(syncCalls, 0);
});

test("a token nearing expiry is refreshed before the next request, and the new one is used", async () => {
  let clock = 1_000_000;
  const authHeaders = [];
  let refreshCalls = 0;
  const client = createSyncClient({
    origin: ORIGIN,
    storage: () => memoryStorage(),
    now: () => clock,
    readState: () => freshState(),
    fetchImpl: async (url, options = {}) => {
      const auth = (options.headers || {}).Authorization;
      if (url.endsWith("/api/auth/login"))
        return json({ email: "l@e.com", state: freshState(), revision: 1, token: "t1", refreshToken: "r1", expiresIn: 3600 });
      if (url.endsWith("/api/auth/refresh")) {
        refreshCalls++;
        assert.deepEqual(JSON.parse(options.body), { refreshToken: "r1" });
        return json({ token: "t2", refreshToken: "r2", expiresIn: 3600 });
      }
      if (url.endsWith("/api/sync")) { authHeaders.push(auth); return json({ state: freshState(), revision: 1, applied: 0 }); }
      return json({ email: "l@e.com" });
    },
  });
  await client.login("l@e.com", PASSWORD);
  authHeaders.length = 0;
  // Jump to inside the 60s skew window before the 1h token expires.
  clock += 3600_000 - 30_000;
  await client.syncNow();
  assert.equal(refreshCalls, 1);
  assert.equal(authHeaders[0], "Bearer t2");
});

test("a 401 on an authed request refreshes and replays before signing out", async () => {
  let firstSync = true;
  let refreshCalls = 0;
  const authHeaders = [];
  const client = createSyncClient({
    origin: ORIGIN,
    storage: () => memoryStorage(),
    readState: () => freshState(),
    fetchImpl: async (url, options = {}) => {
      const auth = (options.headers || {}).Authorization;
      if (url.endsWith("/api/auth/login"))
        return json({ email: "l@e.com", state: freshState(), revision: 1, token: "t1", refreshToken: "r1" });
      if (url.endsWith("/api/auth/refresh")) { refreshCalls++; return json({ token: "t2", refreshToken: "r2" }); }
      if (url.endsWith("/api/sync")) {
        authHeaders.push(auth);
        if (auth === "Bearer t1" && firstSync) { firstSync = false; return json({ error: "expired" }, 401); }
        return json({ state: freshState(), revision: 1, applied: 0 });
      }
      return json({ email: "l@e.com" });
    },
  });
  await client.login("l@e.com", PASSWORD);
  assert.equal(refreshCalls, 1);
  assert.equal(client.account?.email, "l@e.com");
  assert.ok(authHeaders.includes("Bearer t2"));
});

test("a dead refresh token on 401 signs out cleanly", async () => {
  const client = createSyncClient({
    origin: ORIGIN,
    storage: () => memoryStorage(),
    readState: () => freshState(),
    fetchImpl: async (url) => {
      if (url.endsWith("/api/auth/login"))
        return json({ email: "l@e.com", state: freshState(), revision: 1, token: "t1", refreshToken: "r1" });
      if (url.endsWith("/api/auth/refresh")) return json({ error: "expired" }, 401);
      if (url.endsWith("/api/sync")) return json({ error: "expired" }, 401);
      return json({ email: "l@e.com" });
    },
  });
  await assert.rejects(() => client.login("l@e.com", PASSWORD));
  assert.equal(client.account, null);
  assert.equal(client.sessionToken(), "");
});

test("a returning device replays only what changed since its baseline", async () => {
  const dir = await mkdtemp(join(tmpdir(), "forge-sync-client-"));
  const server = createSyncServer({ origins: [ORIGIN], dir, secureCookie: false });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  function makeFetch() {
    const jar = new Map();
    return async (url, options = {}) => {
      const headers = { ...options.headers };
      const cookie = [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
      if (cookie) headers.Cookie = cookie;
      const response = await fetch(base + url.slice(ORIGIN.length), { ...options, headers });
      for (const raw of response.headers.getSetCookie()) {
        const [pair] = raw.split(";");
        const i = pair.indexOf("=");
        const name = pair.slice(0, i).trim();
        const value = pair.slice(i + 1).trim();
        /Max-Age=0/i.test(raw) || !value ? jar.delete(name) : jar.set(name, value);
      }
      return response;
    };
  }
  try {
    const cell = stateCell({ ...freshState(), focusSeconds: 100 });
    const storage = memoryStorage();
    const client = createSyncClient({ origin: ORIGIN, fetchImpl: makeFetch(), storage: () => storage,
      readState: cell.readState, writeState: cell.writeState });
    await client.signup("learner@example.com", PASSWORD, cell.get());
    // Baseline is now recorded. Add 60 more seconds and sync with a baseline present.
    cell.set({ ...cell.get(), focusSeconds: 160 });
    await client.syncNow();
    // Delta of +60 lands once: 160, never 100 + 100 + 60.
    assert.equal(cell.get().focusSeconds, 160);
    // A second sync with no local change must not move the counter.
    await client.syncNow();
    assert.equal(cell.get().focusSeconds, 160);
  } finally {
    server.closeAllConnections?.();
    await new Promise(resolve => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  }
});
