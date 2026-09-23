import assert from "node:assert/strict";
import http from "node:http";
import net from "node:net";
import { once } from "node:events";

const probe = net.createServer();
probe.listen(0, "127.0.0.1");
await once(probe, "listening");
const port = probe.address().port;
await new Promise(resolve => probe.close(resolve));
process.env.PORT = String(port);
const { startServer } = await import("../server.mjs");
const server = await startServer();
const origin = `http://127.0.0.1:${port}`;
const requests = [];
try {
  const { token, csharp } = await (await fetch(origin + "/api/status")).json();
  assert.ok(csharp, "Server integration verification requires the .NET SDK");
  const headers = { origin, "x-forge-token": token, "content-type": "application/json" };
  for (const body of ["null", "[]", "{}", "not json"]) {
    const response = await fetch(origin + "/api/run", { method: "POST", headers, body });
    assert.equal(response.status, 400, "Bad request shape must not become a server error");
  }
  for (const requestHeaders of [{ ...headers, "x-forge-token": "invalid" }, { ...headers, origin: "https://example.invalid" }]) {
    const response = await fetch(origin + "/api/run", { method: "POST", headers: requestHeaders, body: JSON.stringify({ code: "" }) });
    assert.equal(response.status, 403);
  }
  const body = JSON.stringify({ code: 'Thread.Sleep(1000); Console.WriteLine("one run");' });
  function partialRequest() {
    let request;
    const result = new Promise((resolve, reject) => {
      request = http.request(origin + "/api/run", {
        method: "POST", headers: { ...headers, "content-length": Buffer.byteLength(body) },
      }, response => {
        let data = "";
        response.on("data", chunk => data += chunk);
        response.on("end", () => resolve({ status: response.statusCode, body: JSON.parse(data) }));
      });
      request.on("error", reject);
      request.setTimeout(30000, () => request.destroy(new Error("Run request timed out")));
      requests.push(request);
      request.write(body.slice(0, -1));
    });
    return { request, result };
  }
  // Hold both bodies open until the server has begun reading each request.
  const bothReading = new Promise(resolve => {
    let seen = 0;
    const listener = request => {
      if (request.url === "/api/run" && ++seen === 2) {
        server.off("request", listener);
        resolve();
      }
    };
    server.on("request", listener);
  });
  const first = partialRequest();
  const second = partialRequest();
  await bothReading;
  first.request.end(body.slice(-1));
  second.request.end(body.slice(-1));
  const results = await Promise.all([first.result, second.result]);
  assert.deepEqual(results.map(result => result.status).sort(), [200, 429]);
  assert.deepEqual(results.find(result => result.status === 200).body.logs, ["one run"]);
  assert.match(results.find(result => result.status === 429).body.error, /already running/);

  const next = await fetch(origin + "/api/run", {
    method: "POST", headers,
    body: JSON.stringify({ code: 'Console.WriteLine("runner released");' }),
  });
  assert.equal(next.status, 200);
  assert.deepEqual((await next.json()).logs, ["runner released"]);
  const unicodeBody = Buffer.from(JSON.stringify({ code: 'Console.WriteLine("你好 🌍");' }));
  const split = unicodeBody.indexOf(Buffer.from("你")) + 1;
  const unicode = await new Promise((resolve, reject) => {
    const request = http.request(origin + "/api/run", { method: "POST", headers }, response => {
      let body = "";
      response.on("data", data => body += data);
      response.on("end", () => resolve(JSON.parse(body)));
    });
    request.on("error", reject);
    request.write(unicodeBody.subarray(0, split));
    setTimeout(() => request.end(unicodeBody.subarray(split)), 30);
  });
  assert.deepEqual(unicode.logs, ["你好 🌍"], "UTF-8 survives chunk boundaries");
  console.log("PASS concurrent C# requests reserve one runner and release it after completion.");
} finally {
  for (const request of requests) request.destroy();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
