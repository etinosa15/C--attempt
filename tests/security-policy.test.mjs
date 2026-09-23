import test from "node:test";
import assert from "node:assert/strict";
import { readSyncOrigin, readOrigin, appPolicy, policyFor, staticHeaders, bootScriptHash } from "../security-policy.mjs";

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
