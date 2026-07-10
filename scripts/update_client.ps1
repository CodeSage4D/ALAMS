# =============================================================================
# ALAMS - Workstation Client Update Script (PowerShell)
# =============================================================================
$ErrorActionPreference = "Stop"

# Ensure running as administrator
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Error "This updater must be executed as an ADMINISTRATOR."
    exit 1
}

$InstallDir = "C:\Program Files\ALAMS"
$ConfigPath = "C:\ProgramData\ALAMS\config.json"
$ServerUrl = "http://localhost:5000"

# Read Server URL from configuration
if (Test-Path $ConfigPath) {
    try {
        $config = Get-Content -Raw $ConfigPath | ConvertFrom-Json
        if ($config.serverUrl) {
            $ServerUrl = $config.serverUrl
        }
        Write-Host "[ALAMS UPDATE] Configured server URL found: $ServerUrl" -ForegroundColor Cyan
    } catch {
        Write-Host "[WARN] Could not parse config.json. Using default fallback: $ServerUrl" -ForegroundColor Yellow
    }
} else {
    Write-Host "[WARN] config.json not found. Using default fallback: $ServerUrl" -ForegroundColor Yellow
}

# Stop Watchdog Daemon service
$serviceName = "AlamsDaemon"
$svc = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
if ($svc) {
    Write-Host "[ALAMS UPDATE] Stopping service $serviceName..." -ForegroundColor Cyan
    Stop-Service -Name $serviceName -Force -ErrorAction SilentlyContinue
}

# Kill Client App
Write-Host "[ALAMS UPDATE] Stopping running Client instances..." -ForegroundColor Cyan
Stop-Process -Name AlamsClient -Force -ErrorAction SilentlyContinue

# Ensure install directory exists
if (-not (Test-Path $InstallDir)) {
    New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
}

# Download fresh binaries
$clientDownloadUrl = "$ServerUrl/download/client/AlamsClient.exe"
$daemonDownloadUrl = "$ServerUrl/download/client/AlamsDaemon.exe"

$tempClient = Join-Path $env:TEMP "AlamsClient_new.exe"
$tempDaemon = Join-Path $env:TEMP "AlamsDaemon_new.exe"

try {
    Write-Host "[ALAMS UPDATE] Downloading client executable from $clientDownloadUrl..." -ForegroundColor Cyan
    Invoke-WebRequest -Uri $clientDownloadUrl -OutFile $tempClient -UseBasicParsing -TimeoutSec 45
    
    Write-Host "[ALAMS UPDATE] Downloading daemon service executable from $daemonDownloadUrl..." -ForegroundColor Cyan
    Invoke-WebRequest -Uri $daemonDownloadUrl -OutFile $tempDaemon -UseBasicParsing -TimeoutSec 45

    # Overwrite old binaries
    Write-Host "[ALAMS UPDATE] Overwriting existing binaries in $InstallDir..." -ForegroundColor Cyan
    Copy-Item -Path $tempClient -Destination (Join-Path $InstallDir "AlamsClient.exe") -Force
    Copy-Item -Path $tempDaemon -Destination (Join-Path $InstallDir "AlamsDaemon.exe") -Force

    Write-Host "[OK] Binary update successful!" -ForegroundColor Green
} catch {
    Write-Host "[ERROR] Failed to download or copy new binaries: $_" -ForegroundColor Red
    # Start service again and exit
    if ($svc) {
        Start-Service -Name $serviceName -ErrorAction SilentlyContinue
    }
    exit 1
}

# Restart service
if ($svc) {
    Write-Host "[ALAMS UPDATE] Restarting service $serviceName..." -ForegroundColor Cyan
    Start-Service -Name $serviceName -ErrorAction SilentlyContinue
}

# Restart client
Write-Host "[ALAMS UPDATE] Restarting Client shell..." -ForegroundColor Green
Start-Process -FilePath (Join-Path $InstallDir "AlamsClient.exe")

Write-Host "[OK] ALAMS Client update completed successfully!" -ForegroundColor Green
