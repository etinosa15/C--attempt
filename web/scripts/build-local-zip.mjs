// Builds the local C# edition ZIP into web/public/downloads/forge-local.zip so
// Vercel serves it at /downloads/forge-local.zip — same origin as the marketing
// /local-setup page. Runs as web's `prebuild`, so every `next build` (locally and
// on Vercel) refreshes the download from the current repo-root public/ sources.
//
// This mirrors the ZIP that scripts/build-hosted.mjs packages into Render's dist/.
// That Render-side builder is retired at Step 10b (when the static service is
// suspended), after which this is the sole generator — see docs/phase-1-parity.md.
// Keep the entry list and README in step with build-hosted.mjs until then.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", ".."); // web/scripts -> repo root
const outDir = path.join(here, "..", "public", "downloads");

const publicFiles = ["app.js", "core.js", "ui.js", "curriculum.js", "js-lessons.js", "cs-lessons.js",
  "styles.css", "index.html", "404.html", "favicon.svg", "deployment.js", "focus.js",
  "progress-store.js", "runner-client.js", "runner-worker.js", "sync-client.js",
  "buddy.js", "tutor.js", "dock.js", "loader.js",
  "dom-preview.html", "dom-preview.js", "dom-preview.css",
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

// Standard ZIP with stored (uncompressed) entries; needs no archiver or package.
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

const entries = [];
for (const name of publicFiles)
  entries.push(["public/" + name, await readFile(path.join(root, "public", name))]);
for (const name of ["server.mjs", "security-policy.mjs", "Start Forge.cmd"])
  entries.push([name, await readFile(path.join(root, name))]);
entries.push(["package.json", JSON.stringify({ name: "forge-local", private: true, type: "module", scripts: { start: "node server.mjs" }, engines: { node: ">=20" } }, null, 2)]);
entries.push(["README.md", "# Forge local edition\n\nInstall Node.js 20+ (https://nodejs.org) and the .NET 10 SDK (https://dotnet.microsoft.com/download). Extract the entire ZIP first. On Windows double-click Start Forge.cmd. On macOS/Linux, open a terminal in this folder and run npm start. Open http://localhost:4317 and keep the terminal running. No npm install is needed.\n\nRun only code you trust: C# executes on your computer with your permissions. Do not deploy this local server to the internet.\n\nTransfer progress using Settings & backups: export on the website, import locally. After completing C# lessons, export locally and import on the website. Import replaces progress, so export current work first. The two editions do not sync automatically.\n"]);

await mkdir(outDir, { recursive: true });
await writeFile(path.join(outDir, "forge-local.zip"), zip(entries));
console.log("Wrote " + path.join(outDir, "forge-local.zip") + " (" + entries.length + " entries).");
