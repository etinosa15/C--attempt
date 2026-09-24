import { readFile, writeFile, mkdir, rm, lstat, realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { staticHeaders, syncOrigin, tutorOrigin } from "../security-policy.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const destination = path.join(root, "dist");
// Explicit file list: never package .env, .git, saved state, or runtime folders.
const publicFiles = ["app.js", "core.js", "ui.js", "curriculum.js", "js-lessons.js", "cs-lessons.js",
  "styles.css", "index.html", "404.html", "favicon.svg", "deployment.js", "focus.js",
  "progress-store.js", "runner-client.js", "runner-worker.js", "sync-client.js",
  "buddy.js", "tutor.js", "dock.js", "loader.js",
  "dom-preview.html", "dom-preview.js", "dom-preview.css",
  // Self-hosted fonts: shipped so the hosted site and the local ZIP both render
  // the type system without a CDN, keeping the CSP same-origin and offline-safe.
  "fonts/Satoshi-Variable.woff2", "fonts/Satoshi-VariableItalic.woff2",
  "fonts/ClashDisplay-Variable.woff2", "fonts/JetBrainsMono-Regular.woff2",
  "fonts/JetBrainsMono-Medium.woff2", "fonts/JetBrainsMono-Bold.woff2"];

function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
// Standard ZIP with stored entries; requires no platform archiver or npm package.
function zip(entries) {
  const files = [], directory = [];
  let offset = 0;
  for (const [name, contents] of entries) {
    const filename = Buffer.from("forge-local/" + name);
    const data = Buffer.from(contents);
    const crc = crc32(data);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50); header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0x800, 6); header.writeUInt16LE(33, 12);
    header.writeUInt32LE(crc, 14); header.writeUInt32LE(data.length, 18);
    header.writeUInt32LE(data.length, 22); header.writeUInt16LE(filename.length, 26);
    const record = Buffer.alloc(46);
    record.writeUInt32LE(0x02014b50); record.writeUInt16LE(20, 4); record.writeUInt16LE(20, 6);
    record.writeUInt16LE(0x800, 8); record.writeUInt16LE(33, 14);
    record.writeUInt32LE(crc, 16); record.writeUInt32LE(data.length, 20);
    record.writeUInt32LE(data.length, 24); record.writeUInt16LE(filename.length, 28);
    record.writeUInt32LE(offset, 42);
    files.push(header, filename, data); directory.push(record, filename);
    offset += header.length + filename.length + data.length;
  }
  const central = Buffer.concat(directory), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(central.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...files, central, end]);
}

// Verify the absolute generated output path before replacing it. Reject links
// so a misplaced dist symlink cannot redirect a cleanup outside the workspace.
const existing = await lstat(destination).catch(error => { if (error.code !== "ENOENT") throw error; });
if (path.dirname(destination) !== root || path.basename(destination) !== "dist" || existing?.isSymbolicLink())
  throw new Error("Unsafe build output path.");
if (existing && await realpath(destination) !== path.join(await realpath(root), "dist"))
  throw new Error("Build output resolves outside the generated dist directory.");
const entries = [];
for (const name of publicFiles) entries.push(["public/" + name, await readFile(path.join(root, "public", name))]);
for (const name of ["server.mjs", "security-policy.mjs", "Start Forge.cmd"])
  entries.push([name, await readFile(path.join(root, name))]);
entries.push(["package.json", JSON.stringify({ name: "forge-local", private: true, type: "module", scripts: { start: "node server.mjs" }, engines: { node: ">=20" } }, null, 2)]);
entries.push(["README.md", "# Forge local edition\n\nInstall Node.js 20+ (https://nodejs.org) and the .NET 10 SDK (https://dotnet.microsoft.com/download). Extract the entire ZIP first. On Windows double-click Start Forge.cmd. On macOS/Linux, open a terminal in this folder and run npm start. Open http://localhost:4317 and keep the terminal running. No npm install is needed.\n\nRun only code you trust: C# executes on your computer with your permissions. Do not deploy this local server to the internet.\n\nTransfer progress using Settings & backups: export on the website, import locally. After completing C# lessons, export locally and import on the website. Import replaces progress, so export current work first. The two editions do not sync automatically.\n"]);
if (existing) await rm(destination, { recursive: true, force: true });
await mkdir(path.join(destination, "downloads"), { recursive: true });
for (const [name, data] of entries.filter(([name]) => name.startsWith("public/"))) {
  const out = path.join(destination, name.slice(7));
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, data);
}
// syncOrigin and tutorOrigin are already-validated bare origins from
// security-policy.mjs, so the client config and the CSP connect-src come from one
// source. Empty ships local-only, with the offline heuristic tutor.
await writeFile(path.join(destination, "deployment.js"),
  `export const hosted = true;\nexport const syncOrigin = ${JSON.stringify(syncOrigin)};\n` +
  `export const tutorOrigin = ${JSON.stringify(tutorOrigin)};\n`);
await writeFile(path.join(destination, "_headers"), staticHeaders());
await writeFile(path.join(destination, "robots.txt"), "User-agent: *\nAllow: /\nDisallow: /downloads/\n");
await writeFile(path.join(destination, "downloads", "forge-local.zip"), zip(entries));
console.log("Built static site in " + destination + "\nIncludes local C# edition; no server API or secrets are published.");
