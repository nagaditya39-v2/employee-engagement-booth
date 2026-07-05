<#
.SYNOPSIS
    One-shot event-day startup for the Employee Engagement Booth host laptop.

.DESCRIPTION
    - Detects the current LAN IP (WiFi/hotspot)
    - Generates a fresh mkcert certificate for that IP (or reuses an existing one)
    - Updates backend/config.py and frontend constants.ts to match
    - Rebuilds the Angular frontend (skip with -SkipBuild if the IP hasn't changed)
    - Activates the backend venv and starts uvicorn with the correct SSL flags

.USAGE
    Place this file at backend/start-host.ps1, then from the backend folder:

        .\start-host.ps1

    Or, to skip the Angular rebuild (e.g. you already rebuilt for this IP today):

        .\start-host.ps1 -SkipBuild
#>

param(
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"

# ── 0. Make sure this machine trusts mkcert's root CA ────────────────
# Safe to call every time - it's a no-op if already installed.
mkcert -install | Out-Null

# ── 1. Detect LAN IP ──────────────────────────────────────────────────
Write-Host "Detecting LAN IP..." -ForegroundColor Cyan

# Added @(...) here to force an array
$candidates = @(Get-NetIPAddress -AddressFamily IPv4 |
    Where-Object {
        $_.IPAddress -ne "127.0.0.1" -and
        $_.PrefixOrigin -ne "WellKnown" -and
        $_.InterfaceAlias -notmatch "Loopback|vEthernet|Virtual"
    } |
    Select-Object -ExpandProperty IPAddress)

if ($candidates.Count -eq 0) {
    Write-Host "No LAN IP found. Are you connected to the event WiFi/hotspot?" -ForegroundColor Red
    exit 1
}

if ($candidates.Count -eq 1) {
    $lanIp = $candidates[0]
} else {
    Write-Host "Multiple network adapters found:"
    for ($i = 0; $i -lt $candidates.Count; $i++) {
        Write-Host "  [$i] $($candidates[$i])"
    }
    $selection = Read-Host "Which one is the event WiFi/hotspot? Enter the number"
    $lanIp = $candidates[[int]$selection]
}

Write-Host "Using LAN IP: $lanIp" -ForegroundColor Green

# ── 2. Generate mkcert certificate for this IP (reuse if it exists) ──
$certsDir = Join-Path $PSScriptRoot "certs"
if (-not (Test-Path $certsDir)) {
    New-Item -ItemType Directory -Path $certsDir | Out-Null
}

$certFile = Join-Path $certsDir "$lanIp+2.pem"
$keyFile  = Join-Path $certsDir "$lanIp+2-key.pem"

if (-not (Test-Path $certFile) -or -not (Test-Path $keyFile)) {
    Write-Host "No existing certificate for $lanIp - generating one..." -ForegroundColor Cyan
    Push-Location $certsDir
    mkcert $lanIp localhost 127.0.0.1
    Pop-Location
} else {
    Write-Host "Certificate for $lanIp already exists - reusing it." -ForegroundColor Green
}

if (-not (Test-Path $certFile) -or -not (Test-Path $keyFile)) {
    Write-Host "Certificate generation failed - check that mkcert is installed and on PATH." -ForegroundColor Red
    exit 1
}

# ── 3. Update config.py and constants.ts to match this IP ───────────
Write-Host "Updating HOST_URL and API_BASE_URL to https://${lanIp}:8000 ..." -ForegroundColor Cyan

$configPath = Join-Path $PSScriptRoot "config.py"
(Get-Content $configPath) -replace 'HOST_URL\s*=\s*".*"', "HOST_URL = `"https://${lanIp}:8000`"" |
    Set-Content $configPath

$constantsPath = Join-Path $PSScriptRoot "..\frontend\employee-engagement-booth-app\src\app\constants.ts"
if (Test-Path $constantsPath) {
    (Get-Content $constantsPath) -replace "API_BASE_URL\s*=\s*'.*'", "API_BASE_URL = 'https://${lanIp}:8000'" |
        Set-Content $constantsPath
} else {
    Write-Host "Warning: constants.ts not found at expected path - update it manually." -ForegroundColor Yellow
}

# ── 4. Rebuild Angular so the new IP is baked into the static build ──
if (-not $SkipBuild) {
    Write-Host "Rebuilding frontend with the new IP baked in..." -ForegroundColor Cyan
    $frontendDir = Join-Path $PSScriptRoot "..\frontend\employee-engagement-booth-app"
    Push-Location $frontendDir
    ng build
    Pop-Location
} else {
    Write-Host "Skipping Angular rebuild (-SkipBuild passed)." -ForegroundColor Yellow
    Write-Host "Make sure the last build already has this IP baked in, or the frontend will call the wrong address." -ForegroundColor Yellow
}

# ── 5. Activate venv and start uvicorn with SSL ──────────────────────
Write-Host "Starting backend on https://${lanIp}:8000 ..." -ForegroundColor Cyan

$venvActivate = Join-Path $PSScriptRoot "venv\Scripts\Activate.ps1"
if (-not (Test-Path $venvActivate)) {
    Write-Host "venv not found at backend\venv - create it first: python -m venv venv" -ForegroundColor Red
    exit 1
}
. $venvActivate

uvicorn main:app --host 0.0.0.0 --port 8000 --ssl-keyfile="$keyFile" --ssl-certfile="$certFile"
