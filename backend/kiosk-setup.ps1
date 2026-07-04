<#
.SYNOPSIS
    One-time trust setup for a kiosk laptop — imports the mkcert root CA so
    this machine's browser trusts the host's HTTPS certificate.

.DESCRIPTION
    Only needs to run once per kiosk laptop, per event. The root CA itself
    doesn't change when the host's IP changes mid-event — only the per-IP
    leaf certificate does — so you do NOT need to re-run this if the host
    regenerates certs for a new WiFi network. You only need to re-run it if
    this is a laptop that's never trusted this CA before.

.USAGE
    On the HOST laptop, find the CA folder:
        mkcert -CAROOT

    Copy "rootCA.pem" from that folder onto this kiosk laptop (USB drive,
    shared folder, AirDrop-equivalent, whatever's available), then either:

        - place it next to this script as "rootCA.pem", or
        - run:  .\kiosk-setup.ps1 -CertPath "C:\path\to\rootCA.pem"
#>

param(
    [string]$CertPath = "$PSScriptRoot\rootCA.pem"
)

$ErrorActionPreference = "Stop"

Write-Host "Employee Engagement Booth — Kiosk Trust Setup" -ForegroundColor Cyan
Write-Host ""

if (-not (Test-Path $CertPath)) {
    Write-Host "Could not find the root CA certificate at:" -ForegroundColor Red
    Write-Host "    $CertPath" -ForegroundColor Red
    Write-Host ""
    Write-Host "On the HOST laptop, run:  mkcert -CAROOT" -ForegroundColor Yellow
    Write-Host "Copy 'rootCA.pem' from that folder onto this kiosk, then either place it" -ForegroundColor Yellow
    Write-Host "next to this script as 'rootCA.pem', or re-run with -CertPath <path>." -ForegroundColor Yellow
    exit 1
}

Write-Host "Importing root CA into this Windows user's trusted store..." -ForegroundColor Cyan
Import-Certificate -FilePath $CertPath -CertStoreLocation Cert:\CurrentUser\Root | Out-Null

Write-Host ""
Write-Host "Done. Chrome and Edge on this account will now trust the host's HTTPS certificate." -ForegroundColor Green
Write-Host ""
Write-Host "Notes:" -ForegroundColor Yellow
Write-Host " - Firefox keeps its own separate certificate store and won't pick this up." -ForegroundColor Yellow
Write-Host "   Use Chrome or Edge for the kiosk browser." -ForegroundColor Yellow
Write-Host " - This only needs to run once. Re-running it is harmless (it just re-imports)." -ForegroundColor Yellow
Write-Host " - If the host's HTTPS still shows untrusted after this, confirm the IP in the" -ForegroundColor Yellow
Write-Host "   browser URL matches the IP the host most recently generated a cert for." -ForegroundColor Yellow
