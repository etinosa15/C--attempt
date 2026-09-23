import test from "node:test";
import assert from "node:assert/strict";
import { createRunnerClient } from "../public/runner-client.js";

const json = (data, status = 200) => new Response(JSON.stringify(data), { status });
const ready = (token) => ({ csharp: true, sdk: "10.0.400", token });
const success = { logs: ["Hello"], results: [] };

test("an existing client reconnects after a server restart", async () => {
  let token = "before-restart";
  const submissions = [];
  const client = createRunnerClient({
    fetchImpl: async (url, options) => {
      if (url === "/api/status") return json(ready(token));
      submissions.push(options.headers["X-Forge-Token"]);
      assert.equal(submissions.at(-1), token);
      return json(success);
    },
  });
  await client.getStatus();
  await client.run("Console.WriteLine(1);");
  token = "after-restart";
  assert.deepEqual(await client.run("Console.WriteLine(2);"), success);
  assert.deepEqual(submissions, ["before-restart", "after-restart"]);
});

test("a restart during submission refreshes the token and preserves the challenge", async () => {
  let statusReads = 0;
  const bodies = [];
  const client = createRunnerClient({
    fetchImpl: async (url, options) => {
      if (url === "/api/status") return json(ready(String(++statusReads)));
      bodies.push(JSON.parse(options.body));
      return options.headers["X-Forge-Token"] === "1"
        ? json({ error: "Open Forge locally to run code." }, 403)
        : json(success);
    },
  });
  assert.deepEqual(await client.run("learner code", "cs-types"), success);
  assert.equal(statusReads, 2);
  assert.deepEqual(bodies, [
    { code: "learner code", lessonId: "cs-types" },
    { code: "learner code", lessonId: "cs-types" },
  ]);
});

test("persistent rejection stops after one retry", async () => {
  let submissions = 0;
  const client = createRunnerClient({
    fetchImpl: async (url) => {
      if (url === "/api/status") return json(ready("token"));
      submissions++;
      return json({ error: "Open Forge locally to run code." }, 403);
    },
  });
  await assert.rejects(client.run("code"), /Open Forge locally/);
  assert.equal(submissions, 2);
});

for (const mode of ["disconnect", "busy", "server error"]) {
  test(`${mode} does not automatically resubmit code`, async () => {
    let submissions = 0;
    const client = createRunnerClient({
      fetchImpl: async (url) => {
        if (url === "/api/status") return json(ready("token"));
        submissions++;
        if (mode === "disconnect") throw new TypeError("fetch failed");
        return json({ error: mode }, mode === "busy" ? 429 : 500);
      },
    });
    await assert.rejects(client.run("code"));
    assert.equal(submissions, 1);
  });
}

for (const phase of ["status", "submission", "response body"]) {
  test(`a stalled ${phase} times out and the next run can succeed`, async () => {
    let stalled = true;
    let submissions = 0;
    const client = createRunnerClient({
      statusTimeoutMs: 20,
      runTimeoutMs: 20,
      fetchImpl: async (url, { signal }) => {
        const pending = () => new Promise((_, reject) => {
          signal.addEventListener("abort", () => reject(signal.reason), { once: true });
        });
        if (url === "/api/status")
          return stalled && phase === "status" ? pending() : json(ready("token"));
        submissions++;
        if (stalled) return phase === "response body"
          ? { ok: true, status: 200, json: pending }
          : pending();
        return json(success);
      },
    });
    await assert.rejects(client.run("code"), phase === "status" ? /too long to connect/ : /program may have run/);
    assert.equal(submissions, phase === "status" ? 0 : 1);
    stalled = false;
    assert.deepEqual(await client.run("code"), success);
  });
}

test("offline startup recovers on the next run without reloading the page", async () => {
  let online = false;
  const client = createRunnerClient({
    fetchImpl: async (url) => {
      if (!online) throw new TypeError("fetch failed");
      return json(url === "/api/status" ? ready("new-token") : success);
    },
  });
  await assert.rejects(client.getStatus(), /Start or restart Forge/);
  online = true;
  assert.deepEqual(await client.run("code"), success);
});

test("invalid status cannot submit code and invalid response bodies report an error", async () => {
  let submissions = 0;
  let validStatus = false;
  const client = createRunnerClient({
    fetchImpl: async (url) => {
      if (url === "/api/status") return json(validStatus ? ready("token") : {});
      submissions++;
      return new Response("<html>Not Forge</html>");
    },
  });
  await assert.rejects(client.run("code"), /invalid status/);
  assert.equal(submissions, 0);
  validStatus = true;
  await assert.rejects(client.run("code"), /invalid response/);
  assert.equal(submissions, 1);
});
