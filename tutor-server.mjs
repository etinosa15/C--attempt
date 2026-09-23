// The optional AI tutor proxy. Like sync-server.mjs, this is a SEPARATE program
// from server.mjs — that one compiles and runs C# on the learner's machine and is
// bound to loopback for exactly that reason; this one faces the internet. It holds
// the Anthropic API key server-side so the browser never sees it, restricts
// callers to an allow-list of site origins, and returns only a plain hint string.
//
// Node built-ins only (global fetch). Run behind a TLS-terminating proxy.
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { baseHeaders } from "./security-policy.mjs";
import { buildAnthropicRequest, extractMessage } from "./tutor/prompt.mjs";

const BODY_LIMIT = 16 * 1024;
const UPSTREAM_MS = 20000;
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
// A short hint is cheap; Haiku keeps the per-hint cost low and the reply fast,
// which is what a nudge wants. Override with FORGE_TUTOR_MODEL for a stronger one.
const DEFAULT_MODEL = "claude-haiku-4-5-20251001";

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
  fetchImpl = (...args) => fetch(...args),
  trustProxy = false,
  now = () => Date.now(),
  upstreamTimeoutMs = UPSTREAM_MS,
} = {}) {
  const allowed = new Set(origins.filter(Boolean));
  // Generous enough for a study session, low enough that a leaked origin cannot
  // run up an unbounded bill; a serious deployment should also cap at the proxy.
  const byClient = createLimiter({ max: 60, windowMs: 15 * 60 * 1000, now });

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
          "Access-Control-Allow-Headers": "Content-Type, X-Forge-Tutor",
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

      const client = trustProxy
        ? String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket.remoteAddress
        : req.socket.remoteAddress;
      if (!byClient.check(client)) { json(429, { error: "Too many hints for now. Try again shortly." }); return; }
      byClient.record(client);

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

  const timer = setInterval(() => byClient.sweep(), 60 * 60 * 1000);
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
  const model = process.env.FORGE_TUTOR_MODEL || DEFAULT_MODEL;
  const server = createTutorServer({
    origins,
    apiKey,
    model,
    trustProxy: process.env.FORGE_TRUST_PROXY === "1",
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, resolve);
  });
  console.log(`\nForge tutor proxy\nport ${port}\norigins: ${origins.join(", ")}\nmodel: ${model}\n`);
  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  startTutorServer().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
