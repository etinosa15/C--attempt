import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { startServer } from "../server.mjs";
import { freshState } from "../public/core.js";
import { passwordHash } from "../membership.mjs";
import { openStore } from "../member-store.mjs";

async function fixture(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "forge-members-test-"));
  const config = { root: directory, dataDir: directory, production: false, port: 0, origin: "http://localhost:4317", env: {} };
  const server = await startServer({ config, skipDotnet: true });
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await rm(directory, { recursive: true, force: true }); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const status = await fetch(`${origin}/api/status`).then(r => r.json());
  const call = async (route, body, cookie, method = "POST", overrides = {}) => {
    const response = await fetch(origin + route, { method: body === undefined ? "GET" : method, headers: { "Content-Type": "application/json", "X-Forge-Token": status.token, Origin: origin, ...(cookie ? { Cookie: cookie } : {}), ...overrides }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, data: await response.json(), cookie: response.headers.get("set-cookie")?.split(";")[0], headers: response.headers };
  };
  return { directory, config, server, origin, call };
}
const credentials = { name: "Test Learner", email: "learner@example.test", password: "a long test passphrase 123", acceptTerms: true };
test("accounts isolate progress, reject stale revisions and cross-account writes, and persist safely", async t => {
  const { call, directory } = await fixture(t);
  const created = await call("/api/auth/register", credentials);
  assert.equal(created.status, 201); assert.ok(created.cookie); assert.equal(created.data.user.verified, false);
  assert.match(created.headers.get("set-cookie"), /HttpOnly/); assert.match(created.headers.get("set-cookie"), /SameSite=Lax/);
  assert.equal(created.data.user.password, undefined);
  const accountId = created.data.user.id, state = freshState(); state.notes.scratchpad = "my private note"; state.completed = ["js-values"];
  assert.equal((await call("/api/progress", { state, revision: 0, accountId }, created.cookie, "PUT")).status, 200);
  assert.equal((await call("/api/progress", { state, revision: 0, accountId }, created.cookie, "PUT")).status, 409);
  assert.equal((await call("/api/progress", undefined)).status, 401);
  const other = await call("/api/auth/register", { ...credentials, email: "other@example.test" });
  assert.equal((await call("/api/progress", { state, revision: 0, accountId }, other.cookie, "PUT")).status, 403);
  assert.deepEqual((await call("/api/progress", undefined, other.cookie)).data.state.notes, {});
  const fromAnotherDevice = await call("/api/auth/login", credentials);
  const loaded = await call("/api/progress", undefined, fromAnotherDevice.cookie);
  assert.equal(loaded.data.state.notes.scratchpad, "my private note"); assert.equal(loaded.data.revision, 1);
  const disk = JSON.parse(await readFile(path.join(directory, "members.json"), "utf8"));
  assert.equal(disk.users[accountId].progress.notes.scratchpad, "my private note");
  assert.notEqual(disk.users[accountId].password, credentials.password);
  assert.ok(!JSON.stringify(disk.sessions).includes(created.cookie.split("=")[1]));
  assert.equal((await call("/api/auth/logout", {}, fromAnotherDevice.cookie)).status, 200);
  assert.equal((await call("/api/progress", undefined, fromAnotherDevice.cookie)).status, 401);
});
test("recovery tokens stay private, expire after use, and reset revokes every session", async t => {
  const { call, directory } = await fixture(t);
  const created = await call("/api/auth/register", credentials);
  const verifyEmail = JSON.parse((await readFile(path.join(directory, "development-mail.jsonl"), "utf8")).trim());
  const verification = verifyEmail.link.split("token=")[1];
  assert.equal((await call("/api/auth/verify-email", { token: verification })).status, 200);
  assert.equal((await call("/api/auth/verify-email", { token: verification })).status, 400);
  assert.equal((await call("/api/auth/session", undefined, created.cookie)).data.user.verified, true);
  const forgot = await call("/api/auth/forgot-password", { email: credentials.email });
  assert.equal(forgot.status, 200); assert.equal(forgot.data.token, undefined);
  const mail = (await readFile(path.join(directory, "development-mail.jsonl"), "utf8")).trim().split("\n").map(JSON.parse).at(-1);
  const token = mail.link.split("token=")[1], password = "the replacement test passphrase";
  assert.equal((await call("/api/auth/reset-password", { token, password })).status, 200);
  assert.equal((await call("/api/auth/reset-password", { token, password })).status, 400);
  assert.equal((await call("/api/progress", undefined, created.cookie)).status, 401);
  assert.equal((await call("/api/auth/login", credentials)).status, 401);
  assert.equal((await call("/api/auth/login", { ...credentials, password })).status, 200);
});
test("origin, input validation, and password hashing protect account mutations", async t => {
  const { call } = await fixture(t);
  assert.equal((await call("/api/auth/register", credentials, undefined, "POST", { Origin: "https://attacker.invalid" })).status, 403);
  assert.equal((await call("/api/auth/register", { ...credentials, password: "short" })).status, 400);
  assert.equal((await call("/api/auth/register", { ...credentials, acceptTerms: false })).status, 400);
  assert.equal((await call("/api/auth/register", credentials, undefined, "POST", { "X-Forge-Token": "wrong" })).status, 403);
  const hash1 = await passwordHash(credentials.password), hash2 = await passwordHash(credentials.password);
  assert.notEqual(hash1, hash2);
});
test("atomic store serializes concurrent updates and survives reopening", async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "forge-store-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = await openStore(directory);
  await Promise.all(Array.from({ length: 15 }, (_, i) => store.transaction(data => { data.users[`test-${i}`] = { id: i }; })));
  assert.equal(Object.keys((await openStore(directory)).read().users).length, 15);
});
