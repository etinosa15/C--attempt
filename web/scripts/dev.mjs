// Local dev launcher. Some machines run TLS-inspecting security software (e.g.
// Avast/Kaspersky/corporate proxies) that MITMs HTTPS with a private root CA.
// Browsers trust that root (it's in the OS store) but Node ships its own CA list
// and doesn't — so server-side fetch() to Supabase fails with
// UNABLE_TO_VERIFY_LEAF_SIGNATURE and every SSR session check sees "no user".
//
// If a local CA bundle exists at web/certs/local-ca.pem, point Node at it via
// NODE_EXTRA_CA_CERTS (keeps full TLS verification — just adds that root). The
// file is gitignored and machine-specific; on any machine without it this is a
// plain `next dev`, so the script is safe to commit.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createRequire } from "node:module";

const here = dirname(fileURLToPath(import.meta.url));
const caPath = resolve(here, "..", "certs", "local-ca.pem");
const env = { ...process.env };
if (existsSync(caPath) && !env.NODE_EXTRA_CA_CERTS) {
  env.NODE_EXTRA_CA_CERTS = caPath;
  console.log(`[dev] Trusting local CA bundle: ${caPath}`);
}

// Run Next's CLI with the current Node binary (no shell → cross-platform, and no
// child-process shell-escaping deprecation warning).
const require = createRequire(import.meta.url);
const nextBin = require.resolve("next/dist/bin/next");
const child = spawn(process.execPath, [nextBin, "dev"], { stdio: "inherit", env });
child.on("exit", (code) => process.exit(code ?? 0));
