import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

// One Node process owns this file. Transactions are serialized and atomically replaced.
export async function openStore(directory) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const file = path.join(directory, "members.json");
  let data;
  try { data = JSON.parse(await readFile(file, "utf8")); }
  catch (error) {
    if (error.code !== "ENOENT") throw new Error("Account storage could not be read. Restore a backup before starting Forge.");
    data = { version: 1, users: {}, sessions: {}, tokens: {}, orders: {} };
  }
  if (data.version !== 1 || !data.users || !data.sessions || !data.tokens || !data.orders) throw new Error("Unsupported account storage format.");
  let queue = Promise.resolve();
  return {
    read: () => structuredClone(data),
    transaction(change) {
      const task = queue.then(async () => {
        const next = structuredClone(data);
        const result = await change(next);
        const temporary = path.join(directory, `members-${randomUUID()}.tmp`);
        await writeFile(temporary, JSON.stringify(next), { mode: 0o600 });
        await rename(temporary, file);
        data = next;
        return result;
      });
      queue = task.catch(() => {});
      return task;
    },
  };
}
