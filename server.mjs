import http from "node:http";
import { readFile, writeFile, mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { randomUUID, randomBytes } from "node:crypto";
import { lessons } from "./public/curriculum.js";
import { loadFeedbackKey, validateFeedback, deliverFeedback } from "./feedback.mjs";
import { loadConfig } from "./config.mjs";
import { createMembership, failure } from "./membership.mjs";
import { createBilling } from "./billing.mjs";
import { createOnlineRunner } from "./online-runner.mjs";
import { curriculumFor } from "./content-access.mjs";

const root = path.dirname(fileURLToPath(import.meta.url));
const publicRoot = path.join(root, "public");
const runtimeRoot = path.join(root, ".runtime");
const token = randomBytes(24).toString("hex");
const marker = "__FORGE_RESULT__";
let active = false;

export function runProcess(
  file,
  args,
  { cwd = root, timeout = 12000, maxOutput = 64000 } = {},
) {
  return new Promise((resolve) => {
    const child = spawn(file, args, {
      cwd,
      windowsHide: true,
      env: {
        ...process.env,
        DOTNET_CLI_TELEMETRY_OPTOUT: "1",
        DOTNET_NOLOGO: "1",
        DOTNET_SKIP_FIRST_TIME_EXPERIENCE: "1",
      },
    });
    let output = "",
      ended = false,
      timedOut = false;
    const finish = (code, error) => {
      if (ended) return;
      ended = true;
      clearTimeout(timer);
      resolve({ code, output, error, timedOut });
    };
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeout);
    const collect = (data) => {
      output += data.toString();
      if (output.length > maxOutput) {
        output = output.slice(0, maxOutput) + "\n[Output limit reached]";
        child.kill();
      }
    };
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);
    child.on("error", (e) => finish(-1, e.message));
    child.on("close", (code) => finish(code));
  });
}

const versionSort = (a, b) => a.localeCompare(b, undefined, { numeric: true });
export async function findDotnet() {
  const result = await runProcess("dotnet", ["--list-sdks"]);
  const sdks = [...result.output.matchAll(/^(\S+) \[(.+)\]\r?$/gm)]
    .filter((m) => !m[1].includes("-"))
    .sort((a, b) => versionSort(a[1], b[1]));
  if (!sdks.length) return null;
  const sdk = sdks.at(-1);
  const dotnetRoot = path.dirname(sdk[2]);
  const packRoot = path.join(dotnetRoot, "packs", "Microsoft.NETCore.App.Ref");
  try {
    const pack = (await readdir(packRoot))
      .filter((x) => /^\d+\.\d+\.\d+$/.test(x))
      .sort(versionSort)
      .at(-1);
    const tfm = "net" + pack.split(".").slice(0, 2).join(".");
    const refRoot = path.join(packRoot, pack, "ref", tfm);
    const refs = (await readdir(refRoot))
      .filter((x) => x.endsWith(".dll"))
      .map((x) => path.join(refRoot, x));
    return {
      sdk: sdk[1],
      compiler: path.join(sdk[2], sdk[1], "Roslyn", "bincore", "csc.dll"),
      refs,
      tfm,
      framework: pack.split(".").slice(0, 2).join(".") + ".0",
    };
  } catch {
    return null;
  }
}
let dotnet;
const defaultUsings =
  "using System;\nusing System.Collections.Generic;\nusing System.Linq;\nusing System.Threading;\nusing System.Threading.Tasks;\nusing System.Text;\nusing System.Text.Json;\nusing System.IO;\n";

export async function executeCSharp(code, tests = [], sdk = dotnet) {
  if (!sdk)
    return {
      error:
        "The .NET SDK is not available. Install .NET 10 SDK and restart Forge. Lessons and JavaScript still work.",
    };
  await mkdir(runtimeRoot, { recursive: true });
  const dir = path.join(runtimeRoot, randomUUID());
  await mkdir(dir);
  try {
    // Move only namespace imports to the top. Other using statements stay in the submitted program.
    const imports = [];
    const body = code.replace(
      /^\s*(global\s+)?using\s+(?:static\s+)?[\w.]+\s*;\s*$/gm,
      (m) => {
        imports.push(m.trim());
        return "";
      },
    );
    const harness = tests
      .map(
        (test, i) =>
          `try {\n object? forgeValue${i} = (object?)(${test.expression});\n Console.WriteLine("${marker}" + JsonSerializer.Serialize(new { index = ${i}, actual = forgeValue${i} }));\n} catch(Exception forgeError${i}) { Console.WriteLine("${marker}" + JsonSerializer.Serialize(new { index = ${i}, error = forgeError${i}.Message })); }`,
      )
      .join("\n");
    await writeFile(
      path.join(dir, "Program.cs"),
      defaultUsings +
        imports.join("\n") +
        "\n" +
        harness +
        '\n#line 1 "YourCode.cs"\n' +
        body,
    );
    await writeFile(
      path.join(dir, "Program.runtimeconfig.json"),
      JSON.stringify({
        runtimeOptions: {
          tfm: sdk.tfm,
          framework: { name: "Microsoft.NETCore.App", version: sdk.framework },
        },
      }),
    );
    const args = [
      "-nologo",
      "-target:exe",
      "-nullable:enable",
      "-langversion:latest",
      "-out:Program.dll",
      ...sdk.refs.map((ref) => '-r:"' + ref + '"'),
      "Program.cs",
    ];
    await writeFile(path.join(dir, "compile.rsp"), args.join("\n"));
    const compile = await runProcess("dotnet", [sdk.compiler, "@compile.rsp"], {
      cwd: dir,
      timeout: 20000,
    });
    if (compile.code !== 0)
      return {
        error: compile.timedOut
          ? "Compilation timed out."
          : compile.error || compile.output || "Compilation failed.",
        logs: [],
        results: [],
      };
    const run = await runProcess("dotnet", ["Program.dll"], {
      cwd: dir,
      timeout: 5000,
    });
    const results = [];
    const logs = [];
    for (const line of run.output.split(/\r?\n/).filter(Boolean)) {
      if (line.startsWith(marker)) {
        try {
          const item = JSON.parse(line.slice(marker.length));
          const test = tests[item.index];
          if (test)
            results.push({
              ...item,
              label: test.label,
              expected: test.expected,
              passed:
                !item.error &&
                JSON.stringify(item.actual) === JSON.stringify(test.expected),
            });
        } catch {
          logs.push(line);
        }
      } else logs.push(line);
    }
    return {
      logs,
      results,
      warnings: compile.output.trim(),
      error: run.timedOut
        ? "Execution stopped after 5 seconds. Check for an infinite loop."
        : run.code !== 0
          ? run.error || "The program exited with an error. See output below."
          : tests.length && results.length !== tests.length
            ? "The program exited before all checks completed."
            : undefined,
    };
  } finally {
    if (path.dirname(dir) !== runtimeRoot)
      throw new Error("Invalid cleanup path");
    await rm(dir, { recursive: true, force: true, maxRetries: 3 });
  }
}

const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
};
export async function startServer(options = {}) {
  const config = options.config || await loadConfig(root);
  const { port, production, origin, env } = config;
  const members = await createMembership(config, options.services);
  const billing = createBilling(config, members, options.services);
  const online = createOnlineRunner(env, options.services);
  const enforcePlans = env.FORGE_ENFORCE_PLANS === "true";
  if (enforcePlans && !billing.enabled) throw new Error("Plan enforcement requires configured billing. Leave FORGE_ENFORCE_PLANS=false for early access.");
  dotnet = production || online.configured || options.skipDotnet ? null : await findDotnet();
  const feedbackKey = await loadFeedbackKey(root);
  let feedbackNextAllowed = 0;
  const server = http.createServer(async (req, res) => {
    const host = req.headers.host;
    const actualPort = server.address()?.port || port;
    if (!(production ? [new URL(origin).host] : [`127.0.0.1:${actualPort}`, `localhost:${actualPort}`]).includes(host)) {
      res.writeHead(403);
      res.end("Unrecognized host.");
      return;
    }
    const headers = {
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
      ...(production ? { "Strict-Transport-Security": "max-age=31536000" } : {}),
    };
    const json = (status, data) => {
      res.writeHead(status, { ...headers, "Content-Type": "application/json" });
      res.end(JSON.stringify(data));
    };
    try {
      const url = new URL(req.url, production ? origin : `http://${host}`);
      const guard = () => {
        if (!["POST", "PUT"].includes(req.method) || req.headers.origin !== (production ? origin : `http://${host}`) || req.headers["x-forge-token"] !== token || req.headers["content-type"]?.split(";")[0] !== "application/json") throw failure(403, "Refresh Forge and try this action again.");
      };
      const readRaw = async (limit = 2200000) => {
        const chunks = []; let size = 0;
        for await (const chunk of req) { size += chunk.length; if (size > limit) throw failure(413, "This request is too large."); chunks.push(chunk); }
        return Buffer.concat(chunks);
      };
      const readBody = async () => {
        try { const data = JSON.parse(await readRaw()); if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error(); return data; }
        catch (error) { if (error.status) throw error; throw failure(400, "Invalid JSON request."); }
      };
      const context = { json, guard, readRaw, readBody };
      if (url.pathname === "/api/status" && req.method === "GET") {
        json(200, { csharp: online.configured || !!dotnet, runner: online.configured ? "online" : dotnet ? "local" : "unavailable", sdk: dotnet?.sdk, token, feedbackEnabled: !!feedbackKey,
          publicDeployment: production, enforcePlans, billingEnabled: billing.enabled, billingMode: billing.mode, emailEnabled: members.emailEnabled,
          operatorName: env.OPERATOR_NAME || "", supportEmail: env.SUPPORT_EMAIL || "", businessAddress: env.BUSINESS_ADDRESS || "", legalApproved: env.LEGAL_APPROVED === "true" });
        return;
      }
      if (url.pathname === "/api/curriculum" && req.method === "GET") { json(200, curriculumFor(!enforcePlans || members.entitlement(members.current(req)))); return; }
      if (await members.handle(req, res, url, context)) return;
      if (await billing.handle(req, res, url, context)) return;
      if (url.pathname === "/api/feedback" && req.method === "POST") {
        guard();
        const chunks = [];
        let bytes = 0;
        for await (const chunk of req) {
          bytes += chunk.length;
          if (bytes > 32768) { json(413,{success:false,error:"This feedback is too long. Keep the message under 5,000 characters."}); return; }
          chunks.push(chunk);
        }
        let input;
        try { input = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { json(400,{success:false,error:"Invalid feedback request."}); return; }
        const validation = validateFeedback(input);
        if (validation.error) { json(400,{success:false,error:validation.error}); return; }
        if (!feedbackKey) { json(503,{success:false,error:"Feedback delivery is not connected yet. Please try again later."}); return; }
        if (Date.now() < feedbackNextAllowed) {
          res.setHeader("Retry-After", String(Math.ceil((feedbackNextAllowed-Date.now())/1000)));
          json(429,{success:false,error:"Please wait 30 seconds between feedback submissions."});
          return;
        }
        feedbackNextAllowed = Date.now() + 30000;
        const result = await deliverFeedback(validation.value,feedbackKey);
        json(result.status,result.body);
        return;
      }
      if (url.pathname === "/api/run" && req.method === "POST") {
        guard();
        const user = members.current(req);
        if (production && (!user || !user.verified)) { json(403, { error: "Sign in and verify your email to use online C#." }); return; }
        members.rate(`run:${user?.id || req.socket.remoteAddress}`, 20, 60000);
        if (!online.configured && production) { json(503, { error: "Online C# is not connected yet. JavaScript and lessons are available." }); return; }
        if (active) {
          json(429, {
            error: "A C# program is already running. Try again in a moment.",
          });
          return;
        }
        let body = "";
        for await (const chunk of req) {
          body += chunk;
          if (body.length > 100000) {
            json(413, { error: "Code is too large (100 KB limit)." });
            return;
          }
        }
        let input;
        try {
          input = JSON.parse(body);
        } catch {
          json(400, { error: "Invalid JSON request." });
          return;
        }
        if (typeof input.code !== "string") {
          json(400, { error: "Code must be text." });
          return;
        }
        const lesson = input.lessonId
          ? lessons.find((x) => x.id === input.lessonId && x.lang === "cs")
          : null;
        if (input.lessonId && !lesson) {
          json(400, { error: "Unknown C# exercise." });
          return;
        }
        if (lesson && enforcePlans && lesson.module > 0 && !members.entitlement(user)) { json(403, { error: "This challenge is part of Premium. View the plans to continue." }); return; }
        active = true;
        try {
          json(
            200,
            online.configured ? await online.execute(input.code, lesson?.challenge.tests || []) : await executeCSharp(input.code, lesson?.challenge.tests || []),
          );
        } finally {
          active = false;
        }
        return;
      }
      if (!["GET", "HEAD"].includes(req.method)) {
        json(405, { error: "Method not allowed." });
        return;
      }
      let requested;
      try {
        requested = decodeURIComponent(url.pathname);
      } catch {
        json(400, { error: "Invalid URL." });
        return;
      }
      if (enforcePlans && ["/curriculum.js", "/js-lessons.js", "/cs-lessons.js"].includes(requested)) { json(404, { error: "Not found." }); return; }
      const file = path.resolve(
        publicRoot,
        "." + (requested === "/" ? "/index.html" : requested),
      );
      if (
        !file.startsWith(publicRoot + path.sep) ||
        !mime[path.extname(file)]
      ) {
        json(404, { error: "Not found." });
        return;
      }
      const data = await readFile(file);
      const csp =
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; worker-src 'self'; frame-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'self'; form-action 'self'";
      // Workers execute learner code but cannot make network connections.
      const domPolicy =
        "default-src 'none'; script-src 'self' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src data:; connect-src 'none'; object-src 'none'; base-uri 'none'; frame-ancestors 'self'";
      const policy = file.endsWith("runner-worker.js")
        ? "default-src 'none'; script-src 'unsafe-eval'; connect-src 'none'"
        : file.endsWith("dom-preview.html")
          ? domPolicy
          : csp;
      res.writeHead(200, {
        ...headers,
        "Content-Type": mime[path.extname(file)],
        "Content-Security-Policy": policy,
      });
      res.end(req.method === "HEAD" ? undefined : data);
    } catch (e) {
      if (!res.headersSent)
        json(e.status || (e.code === "ENOENT" ? 404 : 500), {
          error:
            e.status ? e.message : e.code === "ENOENT"
              ? "Not found."
              : "The server encountered an error.",
        });
      else res.end();
    }
  });
  server.requestTimeout = 30000;
  server.headersTimeout = 15000;
  server.on("error", (e) => {
    console.error(
      e.code === "EADDRINUSE"
        ? `Port ${port} is in use. Open http://localhost:${port}, or set PORT to a different port.`
        : e.message,
    );
    process.exitCode = 1;
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, production ? "0.0.0.0" : "127.0.0.1", resolve);
  });
  console.log(
    `\nForge Code Academy\n${production ? origin : `http://localhost:${server.address().port}`}\nC# runtime: ${online.configured ? "online compiler" : dotnet ? "SDK " + dotnet.sdk : "not connected"}\nAccounts: enabled | Checkout: ${billing.enabled ? billing.mode : "not connected"}\nKeep this window open. Ctrl+C stops the server.\n`,
  );
  if (process.argv.includes("--open")) {
    if (process.platform === "win32")
      spawn("cmd.exe", ["/c", "start", "", `http://localhost:${port}`], {
        windowsHide: true,
        stdio: "ignore",
      });
    else
      spawn(
        process.platform === "darwin" ? "open" : "xdg-open",
        [`http://localhost:${port}`],
        { stdio: "ignore" },
      );
  }
  return server;
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  startServer().catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  });
