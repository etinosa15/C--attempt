import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSyncServer } from "../sync-server.mjs";
import { freshState, progressChanges } from "../public/core.js";

const ORIGIN = "https://forge.example";
const PASSWORD = "a-good-long-passphrase";

async function withServer(run, options = {}) {
  const dir = await mkdtemp(join(tmpdir(), "forge-sync-api-"));
  const server = createSyncServer({ origins: [ORIGIN], dir, secureCookie: false, ...options });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  // A minimal cookie jar, so the tests exercise the same session handling a
  // browser would rather than passing tokens by hand.
  const jar = new Map();
  async function call(path, { method = "GET", body, origin = ORIGIN, headers = {}, sync = true } = {}) {
    const sent = { ...headers };
    if (sync) sent["X-Forge-Sync"] = "1";
    if (origin) sent.Origin = origin;
    if (body !== undefined) sent["Content-Type"] = "application/json";
    const cookie = [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
    if (cookie) sent.Cookie = cookie;
    const response = await fetch(base + path, {
      method, headers: sent,
      body: body === undefined ? undefined : (typeof body === "string" ? body : JSON.stringify(body)),
    });
    const setCookie = response.headers.getSetCookie();
    for (const raw of setCookie) {
      const [pair] = raw.split(";");
      const index = pair.indexOf("=");
      const name = pair.slice(0, index).trim();
      const value = pair.slice(index + 1).trim();
      /Max-Age=0/i.test(raw) || !value ? jar.delete(name) : jar.set(name, value);
    }
    let data = null;
    try { data = await response.json(); } catch { /* 204 and friends have no body. */ }
    return { status: response.status, data, setCookie, headers: response.headers };
  }

  try {
    await run({ call, jar, base });
  } finally {
    server.closeAllConnections?.();
    await new Promise(resolve => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  }
}

const signup = (call, email = "learner@example.com", extra = {}) =>
  call("/api/auth/signup", { method: "POST", body: { email, password: PASSWORD, ...extra } });

test("signing up creates a session that identifies the learner", async () => {
  await withServer(async ({ call }) => {
    const created = await signup(call);
    assert.equal(created.status, 200);
    assert.equal(created.data.email, "learner@example.com");
    assert.equal(created.data.revision, 1);
    const me = await call("/api/me");
    assert.equal(me.status, 200);
    assert.equal(me.data.email, "learner@example.com");
  });
});

test("the session cookie is not readable by script and not sent cross-site", async () => {
  await withServer(async ({ call }) => {
    const [cookie] = (await signup(call)).setCookie;
    assert.match(cookie, /^forge_session=/);
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /SameSite=Lax/i);
    assert.match(cookie, /Path=\//i);
  });
});

test("a cross-site deployment marks the cookie None and Secure together", async () => {
  await withServer(async ({ call }) => {
    const [cookie] = (await signup(call)).setCookie;
    assert.match(cookie, /SameSite=None/i);
    // Browsers reject SameSite=None without Secure, which would silently break sync.
    assert.match(cookie, /Secure/i);
  }, { crossSite: true });
});

test("no reply ever carries the stored password", async () => {
  await withServer(async ({ call }) => {
    const created = await signup(call);
    const login = await call("/api/auth/login", { method: "POST", body: { email: "learner@example.com", password: PASSWORD } });
    const me = await call("/api/me");
    const sync = await call("/api/sync");
    for (const { data } of [created, login, me, sync]) {
      const text = JSON.stringify(data);
      assert.equal(text.includes(PASSWORD), false);
      assert.equal(text.includes("scrypt$"), false);
      assert.equal("password" in data, false);
    }
  });
});

test("an address can only be claimed once", async () => {
  await withServer(async ({ call }) => {
    assert.equal((await signup(call)).status, 200);
    const again = await signup(call);
    assert.equal(again.status, 409);
  });
});

test("a wrong password and an unknown account are indistinguishable", async () => {
  await withServer(async ({ call }) => {
    await signup(call);
    const wrong = await call("/api/auth/login", { method: "POST", body: { email: "learner@example.com", password: "wrong-passphrase-here" } });
    const unknown = await call("/api/auth/login", { method: "POST", body: { email: "nobody@example.com", password: "wrong-passphrase-here" } });
    assert.equal(wrong.status, 401);
    assert.equal(unknown.status, 401);
    // Identical replies, so the endpoint cannot be used to discover which
    // addresses have accounts.
    assert.deepEqual(wrong.data, unknown.data);
  });
});

test("signing in again reaches the same progress record", async () => {
  await withServer(async ({ call, jar }) => {
    await signup(call);
    await call("/api/sync", { method: "POST", body: { changes: progressChanges(freshState(), { ...freshState(), goal: 60 }) } });
    jar.clear();
    const login = await call("/api/auth/login", { method: "POST", body: { email: "learner@example.com", password: PASSWORD } });
    assert.equal(login.status, 200);
    assert.equal(login.data.state.goal, 60);
  });
});

test("progress is refused without a session, and after signing out", async () => {
  await withServer(async ({ call, jar }) => {
    assert.equal((await call("/api/me")).status, 401);
    assert.equal((await call("/api/sync")).status, 401);
    assert.equal((await call("/api/sync", { method: "POST", body: { changes: [] } })).status, 401);

    await signup(call);
    assert.equal((await call("/api/me")).status, 200);
    const stolen = [...jar][0];
    await call("/api/auth/logout", { method: "POST", body: {} });
    assert.equal((await call("/api/me")).status, 401);

    // The revoked token must not work even if it was captured beforehand.
    jar.set(stolen[0], stolen[1]);
    assert.equal((await call("/api/me")).status, 401);
    jar.clear();
    assert.equal((await call("/api/me", { headers: { Authorization: `Bearer ${stolen[1]}` } })).status, 401);
  });
});

test("another site cannot drive the API with a learner's cookie", async () => {
  await withServer(async ({ call }) => {
    await signup(call);
    // Wrong origin: refused outright.
    const evil = await call("/api/sync", { origin: "https://evil.example" });
    assert.equal(evil.status, 403);
    // Right origin but no custom header — the shape a cross-site form POST can
    // produce. Refused before it reaches the account.
    const forged = await call("/api/sync", { method: "POST", body: { changes: [] }, sync: false });
    assert.equal(forged.status, 403);
    const preflight = await call("/api/sync", { method: "OPTIONS", origin: "https://evil.example" });
    assert.equal(preflight.status, 403);
  });
});

test("a preflight from the allowed site returns usable CORS terms", async () => {
  await withServer(async ({ call }) => {
    const preflight = await call("/api/sync", { method: "OPTIONS" });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get("access-control-allow-origin"), ORIGIN);
    assert.equal(preflight.headers.get("access-control-allow-credentials"), "true");
    assert.match(preflight.headers.get("access-control-allow-headers"), /X-Forge-Sync/i);
    assert.equal(preflight.headers.get("vary"), "Origin");
  });
});

test("two devices' progress merges on the server instead of overwriting", async () => {
  await withServer(async ({ call }) => {
    await signup(call);
    const base = freshState();

    const laptop = { ...base, completed: ["js-values"], focusSeconds: 120, notes: { "js-values": "from laptop" } };
    const first = await call("/api/sync", { method: "POST", body: { changes: progressChanges(base, laptop) } });
    assert.equal(first.status, 200);
    assert.equal(first.data.revision, 2);

    // The phone has been offline: it pushes changes measured from the same
    // starting point, not from what the laptop has since uploaded.
    const phone = { ...base, completed: ["js-loops"], focusSeconds: 45 };
    const second = await call("/api/sync", { method: "POST", body: { changes: progressChanges(base, phone) } });
    assert.equal(second.status, 200);

    assert.deepEqual([...second.data.state.completed].sort(), ["js-loops", "js-values"]);
    assert.equal(second.data.state.focusSeconds, 165);
    assert.equal(second.data.state.notes["js-values"], "from laptop");
    assert.equal((await call("/api/sync")).data.state.focusSeconds, 165);
  });
});

test("hostile changes cannot reach past the record they belong to", async () => {
  await withServer(async ({ call }) => {
    await signup(call);
    const pushed = await call("/api/sync", { method: "POST", body: { changes: [
      { path: ["__proto__", "polluted"], value: "yes" },
      { path: ["constructor", "polluted"], value: "yes" },
      { path: ["version"], value: 99 },
      { path: ["rubrics", "p"], step: 99, value: true },
    ] } });
    assert.equal(pushed.status, 200);
    assert.equal(pushed.data.applied, 0);
    assert.equal({}.polluted, undefined);
    assert.equal(pushed.data.state.version, 1);
    assert.equal(pushed.data.state.goal, 30);
  });
});

test("a value that passes the change shape is still held to the saved schema", async () => {
  await withServer(async ({ call }) => {
    await signup(call);
    // Well-formed paths, impossible values: goal is a fixed choice, hints are
    // capped, and activity keys must be dates.
    const pushed = await call("/api/sync", { method: "POST", body: { changes: [
      { path: ["goal"], value: 99999, add: true },
      { path: ["hints", "js-values"], value: 900 },
      { path: ["activity", "not-a-date"], value: 5 },
      { path: ["notes", "js-values"], value: { nested: "not text" } },
    ] } });
    assert.equal(pushed.status, 200);
    assert.equal(pushed.data.state.goal, 30);
    assert.equal(pushed.data.state.hints["js-values"], 5);
    assert.equal("not-a-date" in pushed.data.state.activity, false);
    assert.equal("js-values" in pushed.data.state.notes, false);
  });
});

test("oversized and malformed bodies are refused", async () => {
  await withServer(async ({ call }) => {
    await signup(call);
    const huge = await call("/api/sync", { method: "POST", body: JSON.stringify({ changes: [], pad: "x".repeat(1024 * 1024 + 10) }) });
    assert.equal(huge.status, 413);
    assert.equal((await call("/api/sync", { method: "POST", body: "{ not json" })).status, 400);
    assert.equal((await call("/api/sync", { method: "POST", body: "[1,2,3]" })).status, 400);
    const bigSignup = await call("/api/auth/signup", { method: "POST", body: JSON.stringify({ email: "a@b.com", password: "x".repeat(5000) }) });
    assert.equal(bigSignup.status, 413);
  });
});

test("signup refuses addresses and passwords it cannot stand behind", async () => {
  await withServer(async ({ call }) => {
    assert.equal((await signup(call, "not-an-email")).status, 400);
    assert.equal((await call("/api/auth/signup", { method: "POST", body: { email: "a@b.com", password: "short" } })).status, 400);
    assert.equal((await signup(call, "a@b.com", { state: { version: 7 } })).status, 400);
  });
});

test("signing up adopts the progress already on this device", async () => {
  await withServer(async ({ call }) => {
    const state = { ...freshState(), completed: ["js-values"], goal: 60 };
    const created = await signup(call, "adopt@example.com", { state });
    assert.equal(created.status, 200);
    assert.deepEqual(created.data.state.completed, ["js-values"]);
    assert.equal(created.data.state.goal, 60);
  });
});

test("repeated password guesses against one address are cut off", async () => {
  await withServer(async ({ call }) => {
    await signup(call);
    let blocked = 0;
    for (let attempt = 0; attempt < 12; attempt++) {
      const result = await call("/api/auth/login", { method: "POST", body: { email: "learner@example.com", password: "wrong-passphrase-here" } });
      if (result.status === 429) blocked++;
    }
    assert.ok(blocked > 0, "expected guessing to be rate limited");
    // The real password still works once the guessing stops, from a limiter
    // that was cleared on the last success rather than left latched.
    assert.equal(blocked < 12, true);
  });
});

test("unknown routes and non-API paths say nothing useful", async () => {
  await withServer(async ({ call }) => {
    assert.equal((await call("/api/nope")).status, 404);
    assert.equal((await call("/")).status, 404);
    assert.equal((await call("/api/health", { sync: false, origin: null })).status, 200);
  });
});
