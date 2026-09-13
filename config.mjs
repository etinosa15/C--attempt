import { readFile } from "node:fs/promises";
import path from "node:path";

export async function loadConfig(root, overrides = process.env) {
  const env = {};
  try {
    for (const line of (await readFile(path.join(root, ".env"), "utf8")).split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (match) env[match[1]] = match[2].replace(/^(["'])(.*)\1$/, "$2");
    }
  } catch (error) { if (error.code !== "ENOENT") throw error; }
  Object.assign(env, overrides);
  const port = Number(env.PORT || 4317);
  const production = env.FORGE_PUBLIC === "true";
  const origin = new URL(env.APP_ORIGIN || `http://localhost:${port}`).origin;
  if (production && !origin.startsWith("https://")) throw new Error("Public hosting requires an HTTPS APP_ORIGIN.");
  if (!production && !["localhost", "127.0.0.1"].includes(new URL(origin).hostname)) throw new Error("Local mode requires a localhost APP_ORIGIN.");
  return { env, port, production, origin, root, dataDir: path.resolve(root, env.DATA_DIR || ".data") };
}
