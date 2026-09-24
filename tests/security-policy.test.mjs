import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  readSyncOrigin, readOrigin, appPolicy, workerPolicy, domPolicy,
  policyFor, staticHeaders, bootScriptHash, baseHeaders,
} from "../security-policy.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("a configured sync origin is reduced to a bare scheme, host and port", () => {
  assert.equal(readSyncOrigin("https://api.forge.example"), "https://api.forge.example");
  assert.equal(readSyncOrigin("https://api.forge.example/"), "https://api.forge.example");
  assert.equal(readSyncOrigin("  https://api.forge.example:8443//  "), "https://api.forge.example:8443");
  // Plain http only makes sense locally: the session cookie is marked Secure.
  assert.equal(readSyncOrigin("http://localhost:4318"), "http://localhost:4318");
  assert.equal(readSyncOrigin("http://127.0.0.1:4318"), "http://127.0.0.1:4318");
});

test("anything that is not a bare origin is refused rather than written into a header", () => {
  for (const bad of [
    "", "   ", undefined, null, "not a url", "api.forge.example",
    "http://api.forge.example",                        // remote plain http
    "https://api.forge.example/path",                  // carries a path
    "https://api.forge.example/?q=1",
    "https://user:pw@api.forge.example",
    "javascript:alert(1)", "data:text/html,x", "file:///etc/passwd",
    // The reason this is validated at all: a value that closes the directive
    // and appends its own would quietly undo the whole policy.
    "https://api.forge.example; script-src 'unsafe-inline'",
    "https://a.example 'unsafe-inline'",
    "'self' 'unsafe-inline'",
  ])
    assert.equal(readSyncOrigin(bad), "", `expected ${String(bad)} to be refused`);
});

test("readOrigin is the shared validator the sync alias points at", () => {
  assert.equal(readOrigin, readSyncOrigin);
  assert.equal(readOrigin("https://tutor.forge.example/"), "https://tutor.forge.example");
  assert.equal(readOrigin("https://tutor.forge.example; script-src 'unsafe-inline'"), "");
});

test("with no sync origin configured the policy is exactly as strict as before accounts", () => {
  // The module reads the environment once at load, and the suite runs without
  // FORGE_SYNC_ORIGIN set, so this is the default shipped policy.
  assert.match(appPolicy, /connect-src 'self';/);
  assert.equal(appPolicy.includes(bootScriptHash), true);
  for (const directive of ["object-src 'none'", "base-uri 'none'", "form-action 'none'", "default-src 'self'"])
    assert.equal(appPolicy.includes(directive), true, `missing ${directive}`);
  assert.equal(/unsafe-inline/.test(appPolicy.split("style-src")[0]), false);
});

test("the generated host headers carry the same policy the server serves", () => {
  const headers = staticHeaders();
  for (const file of ["/index.html", "/404.html", "/dom-preview.html", "/runner-worker.js"])
    assert.equal(headers.includes(`Content-Security-Policy: ${policyFor(file)}`), true, `missing policy for ${file}`);
  // The worker and the DOM preview must keep their own narrower policies.
  assert.notEqual(policyFor("/runner-worker.js"), appPolicy);
  assert.notEqual(policyFor("/dom-preview.html"), appPolicy);
  assert.equal(policyFor("/index.html"), appPolicy);
});

// Drift guard #1: the app CSP pins a sha256 of the inline boot script. It is a
// documented footgun to edit that script and forget to regenerate the hash, so
// recompute it here exactly as the HTML parser does (over the LF-normalised
// text content) and assert the module's constant still matches.
test("the pinned boot-script hash matches the inline script in index.html", () => {
  const html = readFileSync(join(root, "public/index.html"), "utf8").replace(/\r\n/g, "\n");
  const match = html.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(match, "index.html should contain exactly one inline <script>");
  const digest = createHash("sha256").update(match[1], "utf8").digest("base64");
  assert.equal(`'sha256-${digest}'`, bootScriptHash,
    "index.html's inline script changed — regenerate bootScriptHash in security-policy.mjs");
});

// Drift guard #2: Render ignores dist/_headers, so render.yaml restates the
// policy by hand. Assert it still equals the single source of truth, computed
// with the Render sync/tutor origins the blueprint deploys.
test("render.yaml headers match the policy module", () => {
  const yaml = readFileSync(join(root, "render.yaml"), "utf8");
  const renderConnect = "connect-src 'self' https://forge-sync.onrender.com https://forge-tutor.onrender.com";
  // appPolicy loads with no origins configured (connect-src 'self'); splice in
  // the two Render origins to get the exact string the blueprint should carry.
  const expectedApp = appPolicy.replace("connect-src 'self'", renderConnect);
  const cspValues = [...yaml.matchAll(/name: Content-Security-Policy\s*\n\s*value: "([^"]*)"/g)].map((m) => m[1]);
  const appEntries = cspValues.filter((v) => v.startsWith("default-src 'self'"));
  assert.equal(appEntries.length, 3, "expected three app-document CSP entries (/, /index.html, /404.html)");
  for (const value of appEntries)
    assert.equal(value, expectedApp, "an app CSP entry in render.yaml drifted from appPolicy");
  assert.ok(cspValues.includes(workerPolicy), "render.yaml worker CSP drifted from workerPolicy");
  assert.ok(cspValues.includes(domPolicy), "render.yaml DOM-preview CSP drifted from domPolicy");
  // Every baseHeaders entry (including the new HSTS header) must be present in
  // the /* block, name and value.
  for (const [name, val] of Object.entries(baseHeaders)) {
    const re = new RegExp(`path: /\\*\\s*\\n\\s*name: ${name.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}\\s*\\n\\s*value: "?${val.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}"?`);
    assert.match(yaml, re, `render.yaml /* block is missing ${name}: ${val}`);
  }
});
