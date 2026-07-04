<#
.SYNOPSIS
    Opens the kiosk browser window pointed at the host laptop.

.DESCRIPTION
    Launches Chrome or Edge (whichever is found) in a maximized window with a
    dedicated, persistent profile — so the camera permission prompt (needed
    for QR scanning on the Resume page) only has to be granted once per kiosk,
    not on every relaunch.

    Deliberately does NOT use Chrome's actual "--kiosk" flag: that mode
    suppresses browser permission dialogs, which would silently block the
    getUserMedia() camera prompt the QR scanner depends on. This script gives
    you a maximized, distraction-free window instead, without breaking camera
    access.

.USAGE
    .\kiosk-launch.ps1 -HostIp 192.168.1.6

    Run kiosk-setup.ps1 once beforehand so this machine trusts the host's
    certificate — otherwise this will show a certificate warning on launch.
#>

param(
    [Parameter(Mandatory = $true)]
    [string]$HostIp
)

$ErrorActionPreference = "Stop"

$url = "https://$HostIp`:8000"
$profileDir = Join-Path $PSScriptRoot "kiosk-profile"

Write-Host "Launching kiosk window: $url" -ForegroundColor Cyan

$browserPaths = @(
    "$Env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${Env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$Env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
    "${Env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
)

$browserExe = $browserPaths | Where-Object { Test-Path $_ } | Select-Object -First 1

if ($browserExe) {
    Start-Process -FilePath $browserExe -ArgumentList @(
        "--user-data-dir=`"$profileDir`"",
        "--start-maximized",
        "--no-first-run",
        "--disable-features=TranslateUI",
        "`"$url`""
    )
    Write-Host "Launched with $($browserExe.Split('\')[-1])." -ForegroundColor Green
    Write-Host "First launch will prompt for camera permission once — allow it, and it will persist" -ForegroundColor Gray
    Write-Host "for future launches on this kiosk since the profile folder is reused." -ForegroundColor Gray
} else {
    Write-Host "Chrome/Edge not found in the usual install locations." -ForegroundColor Yellow
    Write-Host "Opening with the system default browser instead — camera permission" -ForegroundColor Yellow
    Write-Host "persistence across relaunches is not guaranteed in this fallback path." -ForegroundColor Yellow
    Start-Process $url
}
