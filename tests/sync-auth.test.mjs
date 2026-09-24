import test from "node:test";
import assert from "node:assert/strict";
import {
  hashPassword, verifyPassword, wasteTime, newToken, hashToken,
  normalizeEmail, passwordProblem, MIN_PASSWORD,
} from "../sync/auth.mjs";

test("a password verifies against its own hash and nothing else", async () => {
  const stored = await hashPassword("correct horse battery");
  assert.ok(stored.startsWith("scrypt$"));
  assert.equal(await verifyPassword("correct horse battery", stored), true);
  assert.equal(await verifyPassword("correct horse batterY", stored), false);
  assert.equal(await verifyPassword("", stored), false);
  // The password itself must never appear in what is written to disk.
  assert.equal(stored.includes("correct horse battery"), false);
});

test("equal passwords hash differently, so a stolen store cannot be scanned for repeats", async () => {
  const [a, b] = await Promise.all([hashPassword("same passphrase"), hashPassword("same passphrase")]);
  assert.notEqual(a, b);
  assert.equal(await verifyPassword("same passphrase", a), true);
  assert.equal(await verifyPassword("same passphrase", b), true);
});

test("far more concurrent hashes than the semaphore allows still all complete correctly", async () => {
  // The concurrency cap is 4; queue well past it. Every hash must finish (no
  // deadlock as slots are handed to waiters) and verify against its own password
  // and no other — the semaphore serialises without corrupting results.
  const passwords = Array.from({ length: 20 }, (_, i) => `passphrase-number-${i}`);
  const stored = await Promise.all(passwords.map(hashPassword));
  const checks = await Promise.all(stored.map((hash, i) => verifyPassword(passwords[i], hash)));
  assert.equal(checks.every(Boolean), true, "every queued hash verifies against its own password");
  // A cross-check must fail: hash i does not verify password i+1.
  assert.equal(await verifyPassword(passwords[1], stored[0]), false);
});

test("a damaged stored hash reads as a wrong password rather than a server error", async () => {
  for (const broken of ["", "nonsense", "scrypt$1$2$3", "bcrypt$1$2$3$aaaa$bbbb", null, undefined,
    "scrypt$16384$8$1$!!!notbase64!!!$short"])
    assert.equal(await verifyPassword("anything", broken), false);
  // A missing account still costs a hash, so response time does not reveal
  // which addresses are registered.
  assert.equal(await wasteTime("anything"), false);
});

test("tokens are unguessable, distinct, and stored only as digests", () => {
  const tokens = new Set();
  for (let i = 0; i < 200; i++) tokens.add(newToken());
  assert.equal(tokens.size, 200);
  const token = newToken();
  assert.ok(token.length >= 43);
  assert.match(token, /^[A-Za-z0-9_-]+$/);
  assert.equal(hashToken(token), hashToken(token));
  assert.notEqual(hashToken(token), token);
  assert.match(hashToken(token), /^[0-9a-f]{64}$/);
});

test("addresses normalise to one account and obvious rubbish is refused", () => {
  assert.equal(normalizeEmail("  Learner@Example.COM "), "learner@example.com");
  assert.equal(normalizeEmail("a.b+tag@sub.example.co.uk"), "a.b+tag@sub.example.co.uk");
  for (const bad of ["", "   ", "no-at-sign", "a@b", "a@@b.com", "a b@c.com", "a@b.com ext",
    "@example.com", "a@.com", "../../etc/passwd", "a/b@c.com", 42, null, undefined,
    "a".repeat(250) + "@example.com"])
    assert.equal(normalizeEmail(bad), "", `expected ${String(bad)} to be refused`);
});

test("password policy holds a usable floor, since v1 has no reset", () => {
  assert.equal(passwordProblem("a".repeat(MIN_PASSWORD) + "b"), "");
  assert.notEqual(passwordProblem("short"), "");
  assert.notEqual(passwordProblem("a".repeat(129)), "");
  assert.notEqual(passwordProblem("Password123"), "");
  assert.notEqual(passwordProblem(undefined), "");
});
