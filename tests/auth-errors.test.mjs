import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { resolve } from "./resolve-ts.mjs";

registerHooks({ resolve });

const { friendlyAuthError } = await import("../web/src/lib/auth-errors.ts");

test("names the actual problem for the common Supabase auth errors", () => {
  // The exact case that confused the user: a generic 'invalid credentials'.
  const invalid = friendlyAuthError("Invalid login credentials");
  assert.match(invalid, /don't match/i);
  assert.match(invalid, /Google or GitHub/i); // points at the OAuth-vs-password trap

  assert.match(friendlyAuthError("Email not confirmed"), /confirm/i);
  assert.match(friendlyAuthError("User already registered"), /already exists/i);
  assert.match(friendlyAuthError("Email rate limit exceeded"), /too many/i);
  assert.match(friendlyAuthError("Unable to validate email address: invalid format"), /email/i);
  assert.match(friendlyAuthError("Failed to fetch"), /connection/i);
});

test("falls back safely for unknown or empty input", () => {
  assert.equal(friendlyAuthError(""), "Something went wrong. Please try again.");
  assert.equal(friendlyAuthError(null), "Something went wrong. Please try again.");
  assert.equal(friendlyAuthError(undefined), "Something went wrong. Please try again.");
  // An unrecognized message is passed through rather than swallowed.
  assert.equal(friendlyAuthError("Some novel provider message"), "Some novel provider message");
});
