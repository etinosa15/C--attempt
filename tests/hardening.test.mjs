import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";
import { registerHooks } from "node:module";
import { resolve } from "./resolve-ts.mjs";

registerHooks({ resolve });
const { countInRange } = await import("../web/src/lib/pwned.ts");

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const apiDir = join(root, "web/src/app/api");
const migrationsDir = join(root, "web/supabase/migrations");

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

test("breach range lookup matches the suffix case-insensitively and reads its count", () => {
  const body = "0018A45C4D1DEF81644B54AB7F969B88D65:1\r\n00D4F6E8FA6EECAD2A3AA415EEC418D38EC:2\n011053FD0102E94D6AE2F8B83D76FAF94F6:13";
  assert.equal(countInRange(body, "00d4f6e8fa6eecad2a3aa415eec418d38ec"), 2);
  assert.equal(countInRange(body, "011053FD0102E94D6AE2F8B83D76FAF94F6"), 13);
  assert.equal(countInRange(body, "FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF"), 0);
  assert.equal(countInRange("", "ABC"), 0);
});

// IDOR guard: any API route that holds the service-role (RLS-bypassing) client must
// first establish who the caller is, or verify a signed webhook. A route that used
// the admin client on a caller-supplied id alone would let user A act on user B.
test("every API route using the service-role client authenticates the caller first", () => {
  const routes = walk(apiDir).filter((p) => p.endsWith("route.ts"));
  const offenders = [];
  for (const file of routes) {
    const src = readFileSync(file, "utf8");
    if (!src.includes("createAdminClient")) continue;
    const isWebhook = file.includes(`${join("api", "webhooks")}`);
    const authed = /auth\.getUser\(|resolveUser\(/.test(src);
    const signed = /signature|verif/i.test(src);
    if (!(authed || (isWebhook && signed))) offenders.push(relative(root, file));
  }
  assert.deepEqual(offenders, []);
});

test("admin-client writes in user routes are keyed to the session user, not request input", () => {
  for (const rel of ["account/route.ts", "auth/delete/route.ts"]) {
    const src = readFileSync(join(apiDir, rel), "utf8");
    assert.match(src, /deleteUser\(user\.id\)/, rel);
    assert.doesNotMatch(src, /deleteUser\((body|params|search)/, rel);
  }
});

test("account deletion requires a typed email and a recent sign-in", () => {
  const src = readFileSync(join(apiDir, "account/route.ts"), "utf8");
  assert.match(src, /confirmEmail/);
  assert.match(src, /last_sign_in_at/);
  assert.ok(src.indexOf("last_sign_in_at") < src.indexOf("deleteUser"), "checks run before deletion");
});

test("every public table created in a migration has row level security enabled", () => {
  const sql = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => readFileSync(join(migrationsDir, f), "utf8"))
    .join("\n");
  const tables = [...sql.matchAll(/create table (?:if not exists )?(?:public\.)?("?)(\w+)\1/gi)].map((m) => m[2]);
  assert.ok(tables.length > 0);
  const missing = tables.filter(
    (t) => !new RegExp(`alter table (?:public\.)?"?${t}"? enable row level security`, "i").test(sql),
  );
  assert.deepEqual(missing, []);
});
