$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$taskTunnel = Get-Content -LiteralPath (Join-Path $taskRoot 'tunnel.json') -Raw | ConvertFrom-Json
$taskRuntime = Join-Path $taskRoot '.runtime'
New-Item -ItemType Directory -Path $taskRuntime -Force | Out-Null
$taskBinary = Join-Path $taskRuntime 'cloudflared.exe'
if ((Test-Path -LiteralPath $taskBinary) -and ((Get-FileHash -LiteralPath $taskBinary -Algorithm SHA256).Hash -ieq $taskTunnel.windowsAmd64.sha256)) { return }
Write-Host 'Downloading the pinned Cloudflare tunnel client...'
$taskDownload = Join-Path $taskRuntime 'cloudflared.download.exe'
Invoke-WebRequest -UseBasicParsing -Uri $taskTunnel.windowsAmd64.url -OutFile $taskDownload
if ((Get-FileHash -LiteralPath $taskDownload -Algorithm SHA256).Hash -ine $taskTunnel.windowsAmd64.sha256) { throw 'Cloudflare download checksum mismatch.' }
Move-Item -LiteralPath $taskDownload -Destination $taskBinary -Force
Write-Host 'Tunnel client verified.'
