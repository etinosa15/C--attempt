# Builds the ForgeRunner .NET WASM app and deploys it into web/public/dotnet/,
# where dotnet-loader.ts loads it from. Run from this directory (web/dotnet-runner).
#
#   pwsh ./build.ps1
#
# Prerequisites (one-time):
#   dotnet workload install wasm-tools
$ErrorActionPreference = "Stop"

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $here

Write-Host "Publishing ForgeRunner (browser-wasm, Release)…"
dotnet publish -c Release

# The publish output puts the servable bundle under .../browser-wasm/AppBundle.
$bundle = Get-ChildItem -Path "bin/Release" -Recurse -Directory -Filter "AppBundle" |
    Select-Object -First 1
if ($null -eq $bundle) {
    throw "AppBundle not found under bin/Release — did the publish succeed with the wasm-tools workload installed?"
}

$dest = Join-Path $here "../public/dotnet"
Write-Host "Deploying bundle -> $dest"
if (Test-Path $dest) { Remove-Item -Recurse -Force $dest }
New-Item -ItemType Directory -Force -Path $dest | Out-Null
Copy-Item -Recurse -Force (Join-Path $bundle.FullName "*") $dest

# The marker dotnet-loader.ts probes to decide the runtime is deployed.
'{ "runtime": "dotnet-wasm", "built": true }' | Out-File (Join-Path $dest "forge-runner.json") -Encoding utf8

Write-Host "Done. The in-browser C# runner is now served from /dotnet/."
Write-Host "Verify it: run the Next app, open a locked C# lesson as a Pro learner, and Check."
