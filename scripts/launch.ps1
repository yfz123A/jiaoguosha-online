param([switch]$Public)
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $taskRoot
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Please install Node.js 20.19 or newer first.' }
if (-not (Test-Path -LiteralPath 'node_modules/ws')) {
    npm ci --registry=https://registry.npmjs.org
    if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
}
if (-not (Test-Path -LiteralPath 'dist/game/index.html')) {
    if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) { throw 'Please install pnpm first: npm install -g pnpm@11.25.0' }
    npm run setup
    if ($LASTEXITCODE -ne 0) { throw 'Upstream setup failed.' }
    npm run build
    if ($LASTEXITCODE -ne 0) { throw 'Game build failed.' }
}
if ($Public) {
    & (Join-Path $PSScriptRoot 'download-tunnel.ps1')
    node server/index.mjs --public --open
} else {
    node server/index.mjs --open
}
if ($LASTEXITCODE -ne 0) { throw 'Game server stopped with an error.' }
