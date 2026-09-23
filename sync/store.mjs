// File-per-record JSON store. Chosen over node:sqlite (still experimental) so
// the service keeps the project's zero-dependency rule, and over a managed
// database so the learner's progress never leaves a host they control. The data
// stays inspectable and copy-to-back-up, which matches the export/import ethos.
//
// Everything behind this interface is swappable: only these functions touch the
// disk, so SQLite or Postgres could replace them without auth or merge changes.
import { mkdir, readFile, writeFile, rename, unlink, readdir } from "node:fs/promises";
import { join } from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { hashToken, newToken } from "./auth.mjs";

export const SESSION_MS = 30 * 24 * 60 * 60 * 1000;
// Rewriting the session on every request would turn each read into a write.
// Extend only once it is half spent.
const RENEW_AFTER = SESSION_MS / 2;

// Record names are digests, never caller-supplied text, so no input can escape
// the data directory or collide with a filesystem's case rules.
const fileKey = (value) => createHash("sha256").update(String(value)).digest("hex");

export function createStore({ dir = "./data", now = () => Date.now() } = {}) {
  const accounts = join(dir, "accounts");
  const sessions = join(dir, "sessions");
  const chains = new Map();
  let ready = null;

  function init() {
    ready ||= Promise.all([
      mkdir(accounts, { recursive: true }),
      mkdir(sessions, { recursive: true }),
    ]);
    return ready;
  }

  // One writer at a time per record. Two devices pushing together must queue,
  // or the second read-modify-write would overwrite the first one's merge.
  function withLock(key, work) {
    const previous = chains.get(key) || Promise.resolve();
    const run = previous.then(work, work);
    const settled = run.then(() => {}, () => {});
    chains.set(key, settled);
    settled.then(() => { if (chains.get(key) === settled) chains.delete(key); });
    return run;
  }

  async function readJson(path) {
    try {
      return JSON.parse(await readFile(path, "utf8"));
    } catch {
      // A missing record and a damaged one are both "nothing usable here".
      return null;
    }
  }

  // Write beside the target and rename over it: a crash mid-write leaves the
  // previous record intact rather than a truncated one.
  async function writeJson(path, value) {
    const temp = `${path}.${randomBytes(6).toString("hex")}.tmp`;
    try {
      await writeFile(temp, JSON.stringify(value), "utf8");
      await rename(temp, path);
    } catch (error) {
      await unlink(temp).catch(() => {});
      throw error;
    }
  }

  const accountPath = (email) => join(accounts, `${fileKey(email)}.json`);
  const sessionPath = (digest) => join(sessions, `${digest}.json`);

  async function getAccount(email) {
    await init();
    return readJson(accountPath(email));
  }

  // Returns null when the address is taken. Creation happens under the record's
  // own lock so two simultaneous signups cannot both believe they won.
  async function createAccount(email, password, state) {
    await init();
    return withLock(`account:${email}`, async () => {
      const path = accountPath(email);
      if (await readJson(path)) return null;
      const account = { email, password, created: now(), revision: 1, state };
      await writeJson(path, account);
      return account;
    });
  }

  // Read-modify-write under the lock. `mutate` receives the stored record and
  // returns the new state; the revision it is handed is what the caller must
  // compare against, so a stale push is detected inside the lock, not before.
  async function updateAccount(email, mutate) {
    await init();
    return withLock(`account:${email}`, async () => {
      const path = accountPath(email);
      const account = await readJson(path);
      if (!account) return null;
      const result = await mutate(account);
      if (!result) return null;
      const next = { ...account, state: result.state, revision: account.revision + 1 };
      await writeJson(path, next);
      return next;
    });
  }

  async function createSession(email) {
    await init();
    const token = newToken();
    await writeJson(sessionPath(hashToken(token)), {
      email,
      created: now(),
      expires: now() + SESSION_MS,
    });
    return token;
  }

  // Returns the owning email, sliding the expiry so an active learner is not
  // signed out mid-session. An expired record is removed on sight.
  async function readSession(token) {
    await init();
    const digest = hashToken(token);
    const path = sessionPath(digest);
    const session = await readJson(path);
    if (!session) return null;
    if (!(session.expires > now())) {
      await unlink(path).catch(() => {});
      return null;
    }
    if (session.expires - now() < RENEW_AFTER)
      await writeJson(path, { ...session, expires: now() + SESSION_MS }).catch(() => {});
    return session.email;
  }

  async function deleteSession(token) {
    await init();
    await unlink(sessionPath(hashToken(token))).catch(() => {});
  }

  // Sessions are only removed when someone tries to use them, so a device that
  // never returns would leave its record forever. Swept on service start.
  async function purgeExpired() {
    await init();
    let removed = 0;
    for (const name of await readdir(sessions).catch(() => [])) {
      if (!name.endsWith(".json")) continue;
      const path = join(sessions, name);
      const session = await readJson(path);
      if (!session || !(session.expires > now())) {
        await unlink(path).catch(() => {});
        removed++;
      }
    }
    return removed;
  }

  return { getAccount, createAccount, updateAccount, createSession, readSession, deleteSession, purgeExpired };
}
