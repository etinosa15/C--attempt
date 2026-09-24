// The accounts + sync service. Deliberately a SEPARATE program from server.mjs:
// that one compiles and runs arbitrary C# on the learner's own machine and is
// bound to loopback for exactly that reason. This one is meant to face the
// internet, so the two must never become the same process.
//
// Node built-ins only. Run behind a TLS-terminating proxy.
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createStore, SESSION_MS } from "./sync/store.mjs";
import {
  hashPassword, verifyPassword, wasteTime, normalizeEmail, passwordProblem,
} from "./sync/auth.mjs";
import { freshState, sanitizeState, sanitizeChanges, applyProgressChanges } from "./public/core.js";
import { baseHeaders } from "./security-policy.mjs";

const COOKIE = "forge_session";
const AUTH_BODY_LIMIT = 4 * 1024;
// Notes and drafts are the bulk of a record, and a learner with a full
// curriculum behind them is still far short of this.
const SYNC_BODY_LIMIT = 1024 * 1024;

// Fixed windows, per IP and per address. Enough to stop online guessing without
// a dependency; a serious deployment should also rate-limit at the proxy.
function createLimiter({ max, windowMs, now = () => Date.now() }) {
  const hits = new Map();
  return {
    check(key) {
      const start = now() - windowMs;
      const times = (hits.get(key) || []).filter(t => t > start);
      hits.set(key, times);
      return times.length < max;
    },
    record(key) {
      const times = hits.get(key) || [];
      times.push(now());
      hits.set(key, times);
    },
    clear(key) { hits.delete(key); },
    sweep() {
      const start = now() - windowMs;
      for (const [key, times] of hits) {
        const live = times.filter(t => t > start);
        live.length ? hits.set(key, live) : hits.delete(key);
      }
    },
  };
}

function readCookie(header, name) {
  for (const part of String(header || "").split(";")) {
    const index = part.indexOf("=");
    if (index > 0 && part.slice(0, index).trim() === name)
      return decodeURIComponent(part.slice(index + 1).trim());
  }
  return "";
}

// The trustworthy client address is the entry the immediate proxy appended —
// the RIGHT-MOST X-Forwarded-For token — not the left-most, which the client
// can forge to spoof the per-IP rate-limit key. Only consulted behind a proxy.
function clientAddress(req, trustProxy) {
  if (!trustProxy) return req.socket.remoteAddress;
  const forwarded = String(req.headers["x-forwarded-for"] || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return forwarded.at(-1) || req.socket.remoteAddress;
}

export function createSyncServer({
  origins = [],
  dir = "./data",
  crossSite = false,
  secureCookie = true,
  trustProxy = false,
  now = () => Date.now(),
} = {}) {
  const store = createStore({ dir, now });
  const allowed = new Set(origins.filter(Boolean));
  // Signup and login are the endpoints worth guessing against.
  const byAddress = createLimiter({ max: 10, windowMs: 15 * 60 * 1000, now });
  const byClient = createLimiter({ max: 30, windowMs: 15 * 60 * 1000, now });

  const server = http.createServer(async (req, res) => {
    const origin = req.headers.origin;
    const headers = { ...baseHeaders, "Cache-Control": "no-store" };
    if (origin && allowed.has(origin)) {
      headers["Access-Control-Allow-Origin"] = origin;
      headers["Access-Control-Allow-Credentials"] = "true";
    }
    // The allowed origin varies per request, so caches must not reuse one
    // learner's CORS decision for another's.
    headers.Vary = "Origin";

    const json = (status, data, extra = {}) => {
      res.writeHead(status, { ...headers, ...extra, "Content-Type": "application/json" });
      res.end(JSON.stringify(data));
    };

    try {
      if (req.method === "OPTIONS") {
        if (!origin || !allowed.has(origin)) { json(403, { error: "Origin not allowed." }); return; }
        res.writeHead(204, {
          ...headers,
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, X-Forge-Sync, Authorization",
          "Access-Control-Max-Age": "600",
        });
        res.end();
        return;
      }

      // A browser always sends Origin on cross-origin requests; requiring it to
      // be on the list is what keeps another site from driving this API with a
      // learner's cookie. Requests with no Origin at all (curl, health checks)
      // are allowed only where they cannot carry a cookie's authority.
      if (origin && !allowed.has(origin)) { json(403, { error: "Origin not allowed." }); return; }

      const url = new URL(req.url, "http://sync.invalid");
      if (url.pathname === "/api/health" && req.method === "GET") {
        json(200, { ok: true });
        return;
      }
      if (!url.pathname.startsWith("/api/")) { json(404, { error: "Not found." }); return; }

      // A cross-site HTML form can POST with a cookie but cannot set a custom
      // header; anything that can is forced through the preflight above.
      if (req.headers["x-forge-sync"] !== "1") {
        json(403, { error: "Open Forge to sync your progress." });
        return;
      }

      const client = clientAddress(req, trustProxy);

      async function body(limit) {
        const chunks = [];
        let bytes = 0;
        for await (const chunk of req) {
          bytes += chunk.length;
          if (bytes > limit) return { tooLarge: true };
          chunks.push(chunk);
        }
        try {
          const value = JSON.parse(Buffer.concat(chunks).toString("utf8") || "null");
          if (!value || typeof value !== "object" || Array.isArray(value)) return { invalid: true };
          return { value };
        } catch {
          return { invalid: true };
        }
      }

      const setSession = async (email) => {
        const token = await store.createSession(email);
        const parts = [
          `${COOKIE}=${encodeURIComponent(token)}`,
          "Path=/",
          "HttpOnly",
          `Max-Age=${Math.floor(SESSION_MS / 1000)}`,
          // Lax is right when the API is a sibling of the front-end (the
          // recommended layout). A genuinely cross-site deployment has to opt
          // into None, which browsers only honour alongside Secure.
          crossSite ? "SameSite=None" : "SameSite=Lax",
        ];
        if (secureCookie || crossSite) parts.push("Secure");
        return { token, cookie: parts.join("; ") };
      };

      // Cookie first; the bearer form exists for deployments where a browser
      // refuses the cross-site cookie outright.
      const presented = readCookie(req.headers.cookie, COOKIE) ||
        (String(req.headers.authorization || "").match(/^Bearer (.+)$/)?.[1] ?? "");
      const account = async () => {
        if (!presented) return null;
        const email = await store.readSession(presented);
        return email ? store.getAccount(email) : null;
      };

      if (url.pathname === "/api/auth/signup" && req.method === "POST") {
        if (!byClient.check(client)) { json(429, { error: "Too many attempts. Try again later." }); return; }
        const parsed = await body(AUTH_BODY_LIMIT);
        if (parsed.tooLarge) { json(413, { error: "Request is too large." }); return; }
        if (parsed.invalid) { json(400, { error: "Invalid request." }); return; }
        byClient.record(client);
        const email = normalizeEmail(parsed.value.email);
        if (!email) { json(400, { error: "Enter a valid email address." }); return; }
        const problem = passwordProblem(parsed.value.password);
        if (problem) { json(400, { error: problem }); return; }
        // Seed the account with whatever this device already has, so signing up
        // adopts existing local progress instead of discarding it.
        let seed = freshState();
        if (parsed.value.state !== undefined) {
          try { seed = sanitizeState(parsed.value.state); }
          catch { json(400, { error: "That progress data is not valid." }); return; }
        }
        const created = await store.createAccount(email, await hashPassword(parsed.value.password), seed);
        // A 409 here does reveal that an address is registered. Signup logs the
        // learner straight in, so without an email-verification step (which this
        // service does not have) the response cannot both be useful and hide
        // whether the account exists. Bulk enumeration is bounded instead by the
        // per-client limiter above, which is recorded before this check runs.
        if (!created) { json(409, { error: "An account with that email already exists." }); return; }
        const { token, cookie } = await setSession(email);
        json(200, { email, state: created.state, revision: created.revision, token }, { "Set-Cookie": cookie });
        return;
      }

      if (url.pathname === "/api/auth/login" && req.method === "POST") {
        if (!byClient.check(client)) { json(429, { error: "Too many attempts. Try again later." }); return; }
        const parsed = await body(AUTH_BODY_LIMIT);
        if (parsed.tooLarge) { json(413, { error: "Request is too large." }); return; }
        if (parsed.invalid) { json(400, { error: "Invalid request." }); return; }
        byClient.record(client);
        const email = normalizeEmail(parsed.value.email);
        const password = typeof parsed.value.password === "string" ? parsed.value.password : "";
        // One message and one cost for every failure: a different reply for
        // "no such account" would let anyone test which addresses are registered.
        const deny = () => json(401, { error: "That email or password is not correct." });
        if (!email) { await wasteTime(password); deny(); return; }
        if (!byAddress.check(email)) { json(429, { error: "Too many attempts. Try again later." }); return; }
        const record = await store.getAccount(email);
        if (!record) { await wasteTime(password); byAddress.record(email); deny(); return; }
        if (!await verifyPassword(password, record.password)) { byAddress.record(email); deny(); return; }
        byAddress.clear(email);
        byClient.clear(client);
        const { token, cookie } = await setSession(email);
        json(200, { email, state: record.state, revision: record.revision, token }, { "Set-Cookie": cookie });
        return;
      }

      if (url.pathname === "/api/auth/logout" && req.method === "POST") {
        if (presented) await store.deleteSession(presented);
        const cleared = `${COOKIE}=; Path=/; HttpOnly; Max-Age=0; ${crossSite ? "SameSite=None; Secure" : "SameSite=Lax"}`;
        json(200, { ok: true }, { "Set-Cookie": cleared });
        return;
      }

      // Settle "no such route" before "not signed in", so an unknown path
      // reports what is actually wrong instead of asking for credentials that
      // would not help. The route list is already public in the client.
      if (!["/api/me", "/api/sync"].includes(url.pathname)) { json(404, { error: "Not found." }); return; }

      const current = await account();
      if (!current) { json(401, { error: "Sign in to sync your progress." }); return; }

      if (url.pathname === "/api/me" && req.method === "GET") {
        json(200, { email: current.email, revision: current.revision });
        return;
      }

      if (url.pathname === "/api/sync" && req.method === "GET") {
        json(200, { state: current.state, revision: current.revision });
        return;
      }

      if (url.pathname === "/api/sync" && req.method === "POST") {
        const parsed = await body(SYNC_BODY_LIMIT);
        if (parsed.tooLarge) { json(413, { error: "That progress record is too large to sync." }); return; }
        if (parsed.invalid) { json(400, { error: "Invalid request." }); return; }
        // Two filters, in this order: shape the changes against the known
        // fields before replaying them, then re-check the result against the
        // saved schema. The first stops a path from escaping the record at all;
        // the second stops a well-shaped change from storing a bad value.
        const changes = sanitizeChanges(parsed.value.changes);
        const updated = await store.updateAccount(current.email, (record) => {
          let next;
          try { next = sanitizeState(applyProgressChanges(record.state, changes)); }
          catch { next = record.state; }
          return { state: next };
        });
        if (!updated) { json(401, { error: "Sign in to sync your progress." }); return; }
        json(200, { state: updated.state, revision: updated.revision, applied: changes.length });
        return;
      }

      json(404, { error: "Not found." });
    } catch (error) {
      // Never surface internals: the message could name a path or a record.
      if (res.headersSent) res.end();
      else json(500, { error: "The sync service encountered an error." });
    }
  });

  const timer = setInterval(() => {
    byAddress.sweep();
    byClient.sweep();
    store.purgeExpired().catch(() => {});
  }, 60 * 60 * 1000);
  timer.unref?.();
  server.on("close", () => clearInterval(timer));
  return server;
}

export async function startSyncServer() {
  const port = Number(process.env.PORT || 4318);
  const origins = String(process.env.FORGE_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean);
  if (!origins.length) {
    console.error("Set FORGE_ORIGINS to the site allowed to sync, e.g. FORGE_ORIGINS=https://forge.example");
    process.exitCode = 1;
    return null;
  }
  const insecure = process.env.FORGE_INSECURE_COOKIE === "1";
  const server = createSyncServer({
    origins,
    dir: process.env.FORGE_DATA || "./data",
    crossSite: process.env.FORGE_CROSS_SITE === "1",
    secureCookie: !insecure,
    // Only honour a forwarded address when a proxy is actually in front, or a
    // client could spoof the header and step around the rate limits.
    trustProxy: process.env.FORGE_TRUST_PROXY === "1",
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, resolve);
  });
  console.log(`\nForge sync service\nport ${port}\norigins: ${origins.join(", ")}\ndata: ${process.env.FORGE_DATA || "./data"}` +
    (insecure ? "\nWARNING: FORGE_INSECURE_COOKIE=1 — session cookies are not marked Secure. Local development only.\n" : "\n"));
  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  startSyncServer().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
