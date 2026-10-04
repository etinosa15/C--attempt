#!/usr/bin/env bash
# Builds the ForgeRunner .NET WASM app and deploys it into web/public/dotnet/,
# where dotnet-loader.ts loads it from. Run from this directory (web/dotnet-runner).
#
#   ./build.sh
#
# Prerequisites (one-time):
#   dotnet workload install wasm-tools
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$here"

echo "Publishing ForgeRunner (browser-wasm, Release)…"
dotnet publish -c Release

bundle="$(find bin/Release -type d -name AppBundle | head -n 1)"
if [ -z "$bundle" ]; then
  echo "AppBundle not found under bin/Release — did the publish succeed with the wasm-tools workload installed?" >&2
  exit 1
fi

dest="$here/../public/dotnet"
echo "Deploying bundle -> $dest"
rm -rf "$dest"
mkdir -p "$dest"
cp -R "$bundle"/* "$dest"/

# The marker dotnet-loader.ts probes to decide the runtime is deployed.
printf '{ "runtime": "dotnet-wasm", "built": true }\n' > "$dest/forge-runner.json"

echo "Done. The in-browser C# runner is now served from /dotnet/."
echo "Verify it: run the Next app, open a locked C# lesson as a Pro learner, and Check."
