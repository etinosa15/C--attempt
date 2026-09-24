import http from "node:http";
import { readFile, writeFile, mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { randomUUID, randomBytes } from "node:crypto";
import { lessons } from "./public/curriculum.js";
import { baseHeaders, policyFor } from "./security-policy.mjs";
import { structuralEqual } from "./deep-equal.mjs";

const root = path.dirname(fileURLToPath(import.meta.url));
const hostedPreview = process.argv.includes("--hosted-preview");
const publicRoot = path.join(root, hostedPreview ? "dist" : "public");
const runtimeRoot = path.join(root, ".runtime");
const port = Number(process.env.PORT || (hostedPreview ? 4331 : 4317));
const token = randomBytes(24).toString("hex");
const marker = "__FORGE_RESULT__";
let active = false;

// `child.kill()` on Windows signals only the immediate process, leaving the
// `dotnet` worker it spawned running — a timeout or output-limit abort then
// leaks processes. `taskkill /T` walks and kills the whole tree; on POSIX the
// default signal already reaches the child, so a plain kill is enough.
function killTree(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === "win32" && child.pid) {
    try {
      spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
        windowsHide: true,
        stdio: "ignore",
      }).on("error", () => child.kill());
    } catch {
      child.kill();
    }
  } else {
    child.kill();
  }
}

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
      killTree(child);
    }, timeout);
    const collect = (data) => {
      output += data.toString();
      if (output.length > maxOutput) {
        output = output.slice(0, maxOutput) + "\n[Output limit reached]";
        killTree(child);
      }
    };
    child.stdout.setEncoding("utf8").on("data", collect);
    child.stderr.setEncoding("utf8").on("data", collect);
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
        "\nConsole.OutputEncoding = new UTF8Encoding(false);\n" +
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
                structuralEqual(item.actual, test.expected),
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
  ".zip": "application/zip",
  ".txt": "text/plain; charset=utf-8",
  ".woff2": "font/woff2",
};
export async function startServer() {
  dotnet = hostedPreview ? null : await findDotnet();
  const server = http.createServer(async (req, res) => {
    const host = req.headers.host;
    if (![`127.0.0.1:${port}`, `localhost:${port}`].includes(host)) {
      res.writeHead(403);
      res.end("Local access only.");
      return;
    }
    const headers = {
      ...baseHeaders,
      "Cache-Control": "no-store",
    };
    const json = (status, data) => {
      res.writeHead(status, { ...headers, "Content-Type": "application/json" });
      res.end(JSON.stringify(data));
    };
    // Netlify serves 404.html for an unmatched path. The preview does the same, so a
    // release check exercises the page visitors actually get instead of a JSON body
    // the host never sends. The local edition keeps the JSON reply.
    const missing = async () => {
      if (hostedPreview) {
        const page = path.join(publicRoot, "404.html");
        try {
          const body = await readFile(page);
          res.writeHead(404, {
            ...headers,
            "Content-Type": mime[".html"],
            "Content-Security-Policy": policyFor(page),
          });
          res.end(req.method === "HEAD" ? undefined : body);
          return;
        } catch {
          // Fall through to the JSON reply below.
        }
      }
      json(404, { error: "Not found." });
    };
    try {
      const url = new URL(req.url, `http://${host}`);
      if (hostedPreview && url.pathname.startsWith("/api/")) {
        json(404, { error: "The hosted edition has no compiler API." });
        return;
      }
      if (url.pathname === "/api/status" && req.method === "GET") {
        json(200, { csharp: !!dotnet, sdk: dotnet?.sdk, token });
        return;
      }
      if (url.pathname === "/api/run" && req.method === "POST") {
        if (
          req.headers.origin !== `http://${host}` ||
          req.headers["x-forge-token"] !== token ||
          req.headers["content-type"] !== "application/json"
        ) {
          json(403, { error: "Open Forge locally to run code." });
          return;
        }
        const chunks = [];
        let bytes = 0;
        for await (const chunk of req) {
          bytes += chunk.length;
          if (bytes > 100000) {
            json(413, { error: "Code is too large (100 KB limit)." });
            return;
          }
          chunks.push(chunk);
        }
        let input;
        try {
          input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        } catch {
          json(400, { error: "Invalid JSON request." });
          return;
        }
        if (!input || Array.isArray(input) || typeof input.code !== "string") {
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
        // Reading a request body yields to other requests. Check and reserve
        // the runner together, after that asynchronous work has finished.
        if (active) {
          json(429, {
            error: "A C# program is already running. Try again in a moment.",
          });
          return;
        }
        active = true;
        try {
          json(
            200,
            await executeCSharp(input.code, lesson?.challenge.tests || []),
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
      const file = path.resolve(
        publicRoot,
        "." + (requested === "/" ? "/index.html" : requested),
      );
      if (
        !file.startsWith(publicRoot + path.sep) ||
        !mime[path.extname(file)]
      ) {
        await missing();
        return;
      }
      const data = await readFile(file);
      res.writeHead(200, {
        ...headers,
        "Content-Type": mime[path.extname(file)],
        "Content-Security-Policy": policyFor(file),
      });
      res.end(req.method === "HEAD" ? undefined : data);
    } catch (e) {
      if (res.headersSent) res.end();
      else if (e.code === "ENOENT") await missing();
      else json(500, { error: "The local server encountered an error." });
    }
  });
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
    server.listen(port, "127.0.0.1", resolve);
  });
  console.log(
    `\nForge Code Academy\nhttp://localhost:${port}\nC# runtime: ${dotnet ? "SDK " + dotnet.sdk : "not installed"}\nKeep this window open. Ctrl+C stops the server.\n`,
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
