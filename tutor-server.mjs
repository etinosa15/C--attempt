// The optional AI tutor proxy. Like sync-server.mjs, this is a SEPARATE program
// from server.mjs — that one compiles and runs C# on the learner's machine and is
// bound to loopback for exactly that reason; this one faces the internet. It holds
// the Anthropic API key server-side so the browser never sees it, restricts
// callers to an allow-list of site origins, and returns only a plain hint string.
//
// Node built-ins only (global fetch). Run behind a TLS-terminating proxy.
import http from "node:http";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { baseHeaders, readOrigin } from "./security-policy.mjs";
import { buildAnthropicRequest, extractMessage } from "./tutor/prompt.mjs";

const BODY_LIMIT = 16 * 1024;
const UPSTREAM_MS = 20000;
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
// A short hint is cheap; Haiku keeps the per-hint cost low and the reply fast,
// which is what a nudge wants. Override with FORGE_TUTOR_MODEL for a stronger one.
const DEFAULT_MODEL = "claude-haiku-4-5-20251001";
// Even with per-client limits, a leaked origin token could fan hints across
// many IPs. This global ceiling is the backstop on the daily Anthropic bill;
// once hit, callers transparently fall back to the offline heuristic hint.
const DEFAULT_DAILY_MAX = 500;
// A validated session is trusted this long before the tutor re-checks it with
// the sync service, so a study session is not a call to sync per hint.
const SESSION_CACHE_MS = 60 * 1000;
const SESSION_CHECK_MS = 5000;

// The trustworthy client address is the entry the immediate proxy appended —
// the RIGHT-MOST XFF token — not the left-most, which the client can forge to
// spoof the rate-limit key. Only consulted when a proxy is actually in front.
function clientAddress(req, trustProxy) {
  if (!trustProxy) return req.socket.remoteAddress;
  const forwarded = String(req.headers["x-forwarded-for"] || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return forwarded.at(-1) || req.socket.remoteAddress;
}

function createLimiter({ max, windowMs, now = () => Date.now() }) {
  const hits = new Map();
  return {
    check(key) {
      const start = now() - windowMs;
      const times = (hits.get(key) || []).filter((t) => t > start);
      hits.set(key, times);
      return times.length < max;
    },
    record(key) { hits.set(key, [...(hits.get(key) || []), now()]); },
    sweep() {
      const start = now() - windowMs;
      for (const [key, times] of hits) {
        const live = times.filter((t) => t > start);
        live.length ? hits.set(key, live) : hits.delete(key);
      }
    },
  };
}

export function createTutorServer({
  origins = [],
  apiKey,
  model = DEFAULT_MODEL,
  syncOrigin,
  dailyMax = DEFAULT_DAILY_MAX,
  fetchImpl = (...args) => fetch(...args),
  trustProxy = false,
  now = () => Date.now(),
  upstreamTimeoutMs = UPSTREAM_MS,
} = {}) {
  const allowed = new Set(origins.filter(Boolean));
  // The tutor answers only signed-in learners: a valid session on the sync
  // service is required, checked server-to-server so the two programs stay
  // separate (they never share a process or store, only an HTTPS call). Without
  // a sync origin there is no way to authenticate, so the server refuses to
  // start rather than run open — see startTutorServer.
  const sessionOrigin = readOrigin(syncOrigin);
  // Generous enough for a study session, low enough that a leaked origin cannot
  // run up an unbounded bill; a serious deployment should also cap at the proxy.
  const byClient = createLimiter({ max: 60, windowMs: 15 * 60 * 1000, now });
  // token digest -> timestamp the validation expires. Digest, never the token.
  const sessions = new Map();
  // Rolling per-UTC-day count of upstream calls, the global cost backstop.
  const budget = { day: -1, count: 0 };

  const dayNumber = () => Math.floor(now() / 86400000);
  function budgetAvailable() {
    const today = dayNumber();
    if (budget.day !== today) { budget.day = today; budget.count = 0; }
    return budget.count < dailyMax;
  }

  async function validSession(token) {
    if (!token || !sessionOrigin) return false;
    const key = createHash("sha256").update(token).digest("hex");
    const cached = sessions.get(key);
    if (cached && cached > now()) return true;
    const controller = new AbortController();
    const deadline = setTimeout(() => controller.abort(), SESSION_CHECK_MS);
    try {
      const res = await fetchImpl(sessionOrigin + "/api/me", {
        method: "GET",
        headers: { "X-Forge-Sync": "1", Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });
      if (!res || !res.ok) return false;
      sessions.set(key, now() + SESSION_CACHE_MS);
      return true;
    } catch {
      return false; // Sync down or slow: the client falls back to the offline hint.
    } finally {
      clearTimeout(deadline);
    }
  }

  const server = http.createServer(async (req, res) => {
    const origin = req.headers.origin;
    const headers = { ...baseHeaders, "Cache-Control": "no-store", Vary: "Origin" };
    if (origin && allowed.has(origin)) {
      headers["Access-Control-Allow-Origin"] = origin;
      headers["Access-Control-Allow-Credentials"] = "true";
    }
    const json = (status, data) => {
      res.writeHead(status, { ...headers, "Content-Type": "application/json" });
      res.end(JSON.stringify(data));
    };

    try {
      if (req.method === "OPTIONS") {
        if (!origin || !allowed.has(origin)) { json(403, { error: "Origin not allowed." }); return; }
        res.writeHead(204, {
          ...headers,
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, X-Forge-Tutor, Authorization",
          "Access-Control-Max-Age": "600",
        });
        res.end();
        return;
      }
      // A browser always sends Origin cross-origin; requiring it on the list is
      // what stops another site driving this proxy on the learner's behalf.
      if (origin && !allowed.has(origin)) { json(403, { error: "Origin not allowed." }); return; }

      const url = new URL(req.url, "http://tutor.invalid");
      if (url.pathname === "/api/health" && req.method === "GET") { json(200, { ok: true }); return; }
      if (url.pathname !== "/api/tutor" || req.method !== "POST") { json(404, { error: "Not found." }); return; }
      // The custom header a cross-site HTML form cannot set, same guard as sync.
      if (req.headers["x-forge-tutor"] !== "1") { json(403, { error: "Open Forge to use the tutor." }); return; }

      const client = clientAddress(req, trustProxy);
      if (!byClient.check(client)) { json(429, { error: "Too many hints for now. Try again shortly." }); return; }
      byClient.record(client);

      // Signed-in learners only. The bearer is the learner's sync session,
      // validated against the sync service; signed-out learners get the offline
      // heuristic hint instead (the client falls back on this 401).
      const token = String(req.headers.authorization || "").match(/^Bearer (.+)$/)?.[1] ?? "";
      if (!await validSession(token)) { json(401, { error: "Sign in to use the tutor." }); return; }

      const chunks = [];
      let bytes = 0;
      for await (const chunk of req) {
        bytes += chunk.length;
        if (bytes > BODY_LIMIT) { json(413, { error: "Request is too large." }); return; }
        chunks.push(chunk);
      }
      let payload;
      try { payload = JSON.parse(Buffer.concat(chunks).toString("utf8") || "null"); }
      catch { json(400, { error: "Invalid request." }); return; }

      const body = buildAnthropicRequest(payload, { model });
      if (!body) { json(400, { error: "Invalid request." }); return; }

      // Global daily ceiling: the last guard before spending on the upstream.
      if (!budgetAvailable()) { json(429, { error: "The tutor has reached today's limit. Try again tomorrow." }); return; }
      budget.count++;

      const controller = new AbortController();
      const deadline = setTimeout(() => controller.abort(), upstreamTimeoutMs);
      let upstream;
      try {
        upstream = await fetchImpl(ANTHROPIC_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
          },
          signal: controller.signal,
          body: JSON.stringify(body),
        });
      } catch {
        // Down, slow, or aborted: the client falls back to its offline hint.
        json(502, { error: "The tutor is unavailable right now." });
        return;
      } finally {
        clearTimeout(deadline);
      }
      if (!upstream.ok) { json(502, { error: "The tutor is unavailable right now." }); return; }
      let data = null;
      try { data = await upstream.json(); } catch { data = null; }
      const message = extractMessage(data);
      if (!message) { json(502, { error: "The tutor is unavailable right now." }); return; }
      json(200, { message });
    } catch {
      // Never surface internals — a message could name the key or a path.
      if (res.headersSent) res.end();
      else json(500, { error: "The tutor encountered an error." });
    }
  });

  const timer = setInterval(() => {
    byClient.sweep();
    const t = now();
    for (const [key, expiry] of sessions) if (expiry <= t) sessions.delete(key);
  }, 60 * 60 * 1000);
  timer.unref?.();
  server.on("close", () => clearInterval(timer));
  return server;
}

export async function startTutorServer() {
  const port = Number(process.env.PORT || 4319);
  const origins = String(process.env.FORGE_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
  const apiKey = process.env.ANTHROPIC_API_KEY || "";
  if (!origins.length) {
    console.error("Set FORGE_ORIGINS to the site allowed to use the tutor, e.g. FORGE_ORIGINS=https://forge.example");
    process.exitCode = 1;
    return null;
  }
  if (!apiKey) {
    console.error("Set ANTHROPIC_API_KEY to the key the tutor proxy should use. It is never sent to the browser.");
    process.exitCode = 1;
    return null;
  }
  // The tutor requires a sync session to answer, so it needs the sync service's
  // origin to validate one. Without it there is no way to authenticate a
  // learner, so refuse to start rather than run open.
  const syncOrigin = readOrigin(process.env.FORGE_SYNC_ORIGIN);
  if (!syncOrigin) {
    console.error("Set FORGE_SYNC_ORIGIN to the sync service the tutor validates sessions against, e.g. FORGE_SYNC_ORIGIN=https://forge-sync.example");
    process.exitCode = 1;
    return null;
  }
  const dailyMax = Number(process.env.FORGE_TUTOR_DAILY_MAX) > 0
    ? Number(process.env.FORGE_TUTOR_DAILY_MAX)
    : DEFAULT_DAILY_MAX;
  const model = process.env.FORGE_TUTOR_MODEL || DEFAULT_MODEL;
  const server = createTutorServer({
    origins,
    apiKey,
    model,
    syncOrigin,
    dailyMax,
    trustProxy: process.env.FORGE_TRUST_PROXY === "1",
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, resolve);
  });
  console.log(`\nForge tutor proxy\nport ${port}\norigins: ${origins.join(", ")}\nmodel: ${model}\nsessions validated against: ${syncOrigin}\ndaily hint ceiling: ${dailyMax}\n`);
  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  startTutorServer().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
