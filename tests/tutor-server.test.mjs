import test from "node:test";
import assert from "node:assert/strict";
import { createTutorServer } from "../tutor-server.mjs";

const ORIGIN = "https://forge.example";
const KEY = "sk-ant-test-key";
const SYNC = "https://sync.example";

// Drive the proxy with a stubbed upstream so no real Anthropic call is made. The
// stub records what it received and returns whatever the test sets. The same
// fetchImpl also answers the server-to-server session check the tutor makes
// against the sync service's /api/me, so it is stubbed separately here.
async function withServer(run, { upstream, session, syncOrigin = SYNC, ...options } = {}) {
  let seen = null;
  let reply = upstream || (async () => ({ ok: true, json: async () => ({ content: [{ type: "text", text: "Trace the empty case." }] }) }));
  // Default: any presented bearer is a valid session. Tests override to model a
  // signed-out learner or a sync service that is down.
  let sessionReply = session || (async () => ({ ok: true, json: async () => ({ email: "a@b.co" }) }));
  const fetchImpl = async (url, init) => {
    if (String(url).endsWith("/api/me")) return sessionReply(url, init);
    seen = { url, init, body: JSON.parse(init.body) };
    return reply(url, init);
  };
  const server = createTutorServer({ origins: [ORIGIN], apiKey: KEY, syncOrigin, fetchImpl, ...options });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  async function call(path, { method = "POST", body, origin = ORIGIN, headers = {}, tutor = true, auth = "valid-token" } = {}) {
    const sent = { ...headers };
    if (tutor) sent["X-Forge-Tutor"] = "1";
    if (origin) sent.Origin = origin;
    if (auth) sent.Authorization = `Bearer ${auth}`;
    if (body !== undefined) sent["Content-Type"] = "application/json";
    const response = await fetch(base + path, {
      method, headers: sent,
      body: body === undefined ? undefined : (typeof body === "string" ? body : JSON.stringify(body)),
    });
    let data = null;
    try { data = await response.json(); } catch { /* 204 has no body. */ }
    return { status: response.status, data, headers: response.headers };
  }

  try {
    await run({ call, upstream: () => seen, setReply: (fn) => { reply = fn; }, setSession: (fn) => { sessionReply = fn; } });
  } finally {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
}

const payload = {
  lang: "js", title: "Values", passed: 1, total: 2,
  firstFailing: { label: "Empty input", expected: "Hi there" },
  code: "function greet(n){ return n; }",
};

test("a valid request returns the model's hint and calls the API with the server-held key", async () => {
  await withServer(async ({ call, upstream }) => {
    const res = await call("/api/tutor", { body: payload });
    assert.equal(res.status, 200);
    assert.match(res.data.message, /empty case/i);
    const sent = upstream();
    assert.equal(sent.url, "https://api.anthropic.com/v1/messages");
    assert.equal(sent.init.headers["x-api-key"], KEY);
    assert.equal(sent.init.headers["anthropic-version"], "2023-06-01");
    // The learner's code goes up; the API key never comes back down.
    assert.match(JSON.stringify(sent.body), /function greet/);
    assert.equal(JSON.stringify(res.data).includes(KEY), false);
  });
});

test("a request from an origin not on the list is refused", async () => {
  await withServer(async ({ call, upstream }) => {
    const res = await call("/api/tutor", { body: payload, origin: "https://evil.example" });
    assert.equal(res.status, 403);
    assert.equal(upstream(), null, "an untrusted origin must never reach the model");
  });
});

test("the custom header a cross-site form cannot set is required", async () => {
  await withServer(async ({ call, upstream }) => {
    const res = await call("/api/tutor", { body: payload, tutor: false });
    assert.equal(res.status, 403);
    assert.equal(upstream(), null);
  });
});

test("an over-large body is rejected before it reaches the model", async () => {
  await withServer(async ({ call, upstream }) => {
    const res = await call("/api/tutor", { body: { ...payload, code: "x".repeat(20 * 1024) } });
    assert.equal(res.status, 413);
    assert.equal(upstream(), null);
  });
});

test("unparseable or empty payloads are 400, never an upstream call", async () => {
  await withServer(async ({ call, upstream }) => {
    assert.equal((await call("/api/tutor", { body: "not json{" })).status, 400);
    assert.equal((await call("/api/tutor", { body: "null" })).status, 400);
    assert.equal(upstream(), null);
  });
});

test("an upstream error becomes a plain 502 so the client falls back offline", async () => {
  await withServer(async ({ call, setReply }) => {
    setReply(async () => ({ ok: false, json: async () => ({ error: { message: "overloaded" } }) }));
    const res = await call("/api/tutor", { body: payload });
    assert.equal(res.status, 502);
    assert.doesNotMatch(JSON.stringify(res.data), /overloaded/, "upstream detail must not leak");
  });
});

test("an upstream that throws is a 502, not a crash", async () => {
  await withServer(async ({ call, setReply }) => {
    setReply(async () => { throw new Error("connection reset"); });
    const res = await call("/api/tutor", { body: payload });
    assert.equal(res.status, 502);
  });
});

test("a blank model reply is treated as unavailable", async () => {
  await withServer(async ({ call, setReply }) => {
    setReply(async () => ({ ok: true, json: async () => ({ content: [{ type: "text", text: "   " }] }) }));
    assert.equal((await call("/api/tutor", { body: payload })).status, 502);
  });
});

test("hints are rate limited per client", async () => {
  await withServer(async ({ call }) => {
    let last = 200;
    for (let i = 0; i < 62; i++) last = (await call("/api/tutor", { body: payload })).status;
    assert.equal(last, 429);
  }, { origins: [ORIGIN] });
});

test("a request without a session bearer is refused before the model", async () => {
  await withServer(async ({ call, upstream }) => {
    const res = await call("/api/tutor", { body: payload, auth: null });
    assert.equal(res.status, 401);
    assert.equal(upstream(), null, "an unauthenticated caller must never reach the model");
  });
});

test("a bearer the sync service rejects is a 401, not a hint", async () => {
  await withServer(async ({ call, upstream, setSession }) => {
    setSession(async () => ({ ok: false, json: async () => ({}) }));
    const res = await call("/api/tutor", { body: payload });
    assert.equal(res.status, 401);
    assert.equal(upstream(), null, "an invalid session must never reach the model");
  });
});

test("a valid session validated against /api/me is served, with the bearer forwarded to sync", async () => {
  await withServer(async ({ call, setSession }) => {
    let sawBearer = null;
    setSession(async (_url, init) => {
      sawBearer = init.headers.Authorization;
      return { ok: true, json: async () => ({ email: "a@b.co" }) };
    });
    const res = await call("/api/tutor", { body: payload, auth: "learner-token" });
    assert.equal(res.status, 200);
    assert.equal(sawBearer, "Bearer learner-token", "the tutor validates the learner's own bearer with sync");
  });
});

test("the global daily ceiling stops upstream calls once reached", async () => {
  let upstreamCalls = 0;
  await withServer(async ({ call }) => {
    let last = 200;
    for (let i = 0; i < 3; i++) last = (await call("/api/tutor", { body: payload })).status;
    assert.equal(last, 429, "the third hint is over the daily ceiling of two");
    assert.equal(upstreamCalls, 2, "only the two hints within budget reached the model");
  }, {
    dailyMax: 2,
    upstream: async () => { upstreamCalls++; return { ok: true, json: async () => ({ content: [{ type: "text", text: "hint" }] }) }; },
  });
});

test("the daily ceiling resets at the UTC-day boundary", async () => {
  let clock = 0;
  await withServer(async ({ call }) => {
    assert.equal((await call("/api/tutor", { body: payload })).status, 200);
    assert.equal((await call("/api/tutor", { body: payload })).status, 429, "second call is over the ceiling of one");
    clock += 86400000; // next UTC day
    assert.equal((await call("/api/tutor", { body: payload })).status, 200, "the budget resets the next day");
  }, { dailyMax: 1, now: () => clock });
});

test("health needs no header and unknown routes are 404", async () => {
  await withServer(async ({ call }) => {
    assert.equal((await call("/api/health", { method: "GET", tutor: false })).status, 200);
    assert.equal((await call("/api/nope", { method: "GET" })).status, 404);
    assert.equal((await call("/api/tutor", { method: "GET" })).status, 404);
  });
});
