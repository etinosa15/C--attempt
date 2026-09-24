// Password and token primitives for the sync service. Node built-ins only, so
// the project keeps its zero-dependency rule; scrypt is the strongest password
// hash reachable without a native package (Argon2id would need one).
import { randomBytes, scrypt, timingSafeEqual, createHash } from "node:crypto";

// ~16MB and ~100ms per hash on current hardware: costly enough to make offline
// cracking of a stolen store slow, cheap enough to serve logins.
const N = 16384, R = 8, P = 1, KEYLEN = 64, MAXMEM = 64 * 1024 * 1024;
const SALT_BYTES = 16;
export const TOKEN_BYTES = 32;

// scrypt is deliberately expensive (~16MB and ~100ms each). Left unbounded, a
// burst of logins or signups could run many in parallel and exhaust the small
// instance's memory. This semaphore caps concurrent hashes; the rest queue, so
// peak memory stays ~MAX_CONCURRENT×16MB and CPU serialises under load. It does
// not change the hashes themselves or the constant-time comparison.
const MAX_CONCURRENT = 4;
let running = 0;
const waiters = [];
function acquire() {
  if (running < MAX_CONCURRENT) { running++; return Promise.resolve(); }
  return new Promise((resolve) => waiters.push(resolve));
}
function release() {
  const next = waiters.shift();
  if (next) next(); // Hand the slot straight to the next waiter.
  else running--;
}
function runScrypt(password, salt, keylen, options) {
  return acquire().then(
    () =>
      new Promise((resolve, reject) => {
        scrypt(password, salt, keylen, options, (error, key) =>
          error ? reject(error) : resolve(key),
        );
      }).finally(release),
  );
}

const derive = (password, salt) =>
  runScrypt(password, salt, KEYLEN, { N, r: R, p: P, maxmem: MAXMEM });
// No password reset exists in v1, so the floor stays reachable rather than
// strict: length is what defeats guessing, and a locked-out learner cannot
// recover an account by email.
export const MIN_PASSWORD = 10;
export const MAX_PASSWORD = 128;
const MAX_EMAIL = 254;
const COMMON = new Set([
  "password123", "123456789012", "qwertyuiop", "1234567890", "letmein123",
  "passw0rd123", "welcome12345", "iloveyou123", "adminadmin", "0123456789",
]);

export async function hashPassword(password) {
  const salt = randomBytes(SALT_BYTES);
  const key = await derive(password, salt);
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${key.toString("base64")}`;
}

// Constant-time, and never throws on a malformed stored value — a damaged
// record must read as "wrong password", not as a server error that would tell
// an attacker the account exists.
export async function verifyPassword(password, stored) {
  try {
    const [scheme, n, r, p, salt, key] = String(stored).split("$");
    if (scheme !== "scrypt") return false;
    const expected = Buffer.from(key, "base64");
    if (expected.length !== KEYLEN) return false;
    const actual = await runScrypt(password, Buffer.from(salt, "base64"), KEYLEN, {
      N: Number(n), r: Number(r), p: Number(p), maxmem: MAXMEM,
    });
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

// Logging in to a missing account must cost the same as logging in to a real
// one, or response time alone reveals which emails are registered.
const DECOY = `scrypt$${N}$${R}$${P}$${randomBytes(SALT_BYTES).toString("base64")}$${randomBytes(KEYLEN).toString("base64")}`;
export async function wasteTime(password) {
  await verifyPassword(password, DECOY);
  return false;
}

export function newToken() {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

// Sessions are stored as digests. Someone who reads the data directory gets no
// usable cookie, and the lookup stays a single exact match.
export function hashToken(token) {
  return createHash("sha256").update(String(token)).digest("hex");
}

// Deliberately conservative: this address becomes a filename key, and the only
// account identifier a learner has. Normalised so "A@b.com" and "a@b.com" are
// one account rather than two divergent progress records.
export function normalizeEmail(email) {
  if (typeof email !== "string") return "";
  const value = email.trim().toLowerCase();
  if (value.length < 3 || value.length > MAX_EMAIL) return "";
  if (!/^[^\s@"'\\/]+@[^\s@.]+(\.[^\s@.]+)+$/.test(value)) return "";
  return value;
}

export function passwordProblem(password) {
  if (typeof password !== "string") return "Enter a password.";
  if (password.length < MIN_PASSWORD) return `Use at least ${MIN_PASSWORD} characters.`;
  if (password.length > MAX_PASSWORD) return `Use at most ${MAX_PASSWORD} characters.`;
  if (COMMON.has(password.toLowerCase())) return "That password is too common. Choose another.";
  return "";
}
