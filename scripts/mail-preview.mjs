import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../config.mjs";
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const config = await loadConfig(root);
if (config.production) throw new Error("The development mailbox is disabled in public mode.");
try {
  const items = (await readFile(path.join(config.dataDir, "development-mail.jsonl"), "utf8")).trim().split("\n").filter(Boolean).map(JSON.parse).slice(-10);
  for (const item of items) console.log(`${item.kind.toUpperCase()} · ${item.to}\n${item.createdAt}\n${item.link}\n`);
} catch (error) { if (error.code === "ENOENT") console.log("No development emails yet. Create an account or request a password reset first."); else throw error; }
