# =============================================================================
# ALAMS - Post-Deployment Automated Smoke Test Runner
# =============================================================================
# Purpose: Validates that server and local workstation configurations are functional.
# Usage: powershell -ExecutionPolicy Bypass -File smoke_test.ps1
# =============================================================================

$ErrorActionPreference = "Stop"

Write-Host "=============================================" -ForegroundColor Cyan
Write-Host " ALAMS - Post-Deployment Smoke Test Runner   " -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host ""

$Passed = $true

# --- Test 1: Check Server Health Endpoint ---
Write-Host "[TEST 1] Verifying server API responsiveness..." -ForegroundColor White
try {
    $response = Invoke-RestMethod -Uri "http://localhost:5000/health" -Method Get -TimeoutSec 3
    if ($response.status -eq "healthy") {
        Write-Host "  [PASS] http://localhost:5000/health is responsive and healthy." -ForegroundColor Green
    } else {
        Write-Host "  [FAIL] Health endpoint returned invalid payload." -ForegroundColor Red
        $Passed = $false
    }
} catch {
    Write-Host "  [FAIL] Failed to contact health API: $_" -ForegroundColor Red
    $Passed = $false
}

# --- Test 2: Check Database Connection via Diagnostics ---
Write-Host "[TEST 2] Verifying database connectivity..." -ForegroundColor White
try {
    $response = Invoke-RestMethod -Uri "http://localhost:5000/api/v1/health/diagnostics" -Method Get -TimeoutSec 3
    if ($response.dbConnected -eq $true) {
        Write-Host "  [PASS] Central database connection confirmed." -ForegroundColor Green
        Write-Host "         Asset count: Lab Zones: $($response.metrics.labs) | Paired PCs: $($response.metrics.computers)" -ForegroundColor Cyan
    } else {
        Write-Host "  [FAIL] Diagnostics indicates database is disconnected." -ForegroundColor Red
        $Passed = $false
    }
} catch {
    Write-Host "  [FAIL] Diagnostics API check failed: $_" -ForegroundColor Red
    $Passed = $false
}

# --- Test 3: Check Workstation Local Files (WPF/Watchdog presence) ---
Write-Host "[TEST 3] Verifying workstation installation files..." -ForegroundColor White
$InstallDir = "C:\Program Files\ALAMS"
$ConfigPath = "C:\ProgramData\ALAMS\config.json"

$clientPath = Join-Path $InstallDir "AlamsClient.exe"
$watchdogPath = Join-Path $InstallDir "AlamsWatchdog.exe"

$localFilesOk = $true
if (-not (Test-Path $clientPath)) {
    Write-Host "  [FAIL] AlamsClient.exe is missing from $clientPath" -ForegroundColor Red
    $localFilesOk = $false
    $Passed = $false
}
if (-not (Test-Path $watchdogPath)) {
    Write-Host "  [FAIL] AlamsWatchdog.exe is missing from $watchdogPath" -ForegroundColor Red
    $localFilesOk = $false
    $Passed = $false
}

if ($localFilesOk) {
    Write-Host "  [PASS] Installation binaries exist in target Program Files directory." -ForegroundColor Green
}

# --- Test 4: Check Local Configuration file ---
Write-Host "[TEST 4] Verifying local workstation config.json..." -ForegroundColor White
if (-not (Test-Path $ConfigPath)) {
    Write-Host "  [FAIL] config.json is missing at $ConfigPath" -ForegroundColor Red
    $Passed = $false
} else {
    try {
        $config = Get-Content -Raw -Path $ConfigPath | ConvertFrom-Json
        if (-not $config.serverUrl) {
            Write-Host "  [FAIL] serverUrl key is missing from config.json" -ForegroundColor Red
            $Passed = $false
        } else {
            Write-Host "  [PASS] config.json found and loaded. Server Target: $($config.serverUrl)" -ForegroundColor Green
        }
    } catch {
        Write-Host "  [FAIL] Failed to parse config.json: $_" -ForegroundColor Red
        $Passed = $false
    }
}

# --- Test 5: Check Watchdog Service status ---
Write-Host "[TEST 5] Verifying Watchdog service registration..." -ForegroundColor White
$watchdogSvc = Get-Service -Name "AlamsWatchdog" -ErrorAction SilentlyContinue
if (-not $watchdogSvc) {
    Write-Host "  [FAIL] AlamsWatchdog service is NOT registered on this machine." -ForegroundColor Red
    $Passed = $false
} else {
    Write-Host "  [PASS] AlamsWatchdog service is registered (Status: $($watchdogSvc.Status))" -ForegroundColor Green
}

# --- Smoke Test Summary ---
Write-Host ""
if ($Passed) {
    Write-Host "=============================================" -ForegroundColor Green
    Write-Host " ALL SMOKE TESTS PASSED (DEPLOYMENT GO)      " -ForegroundColor Green
    Write-Host "=============================================" -ForegroundColor Green
    exit 0
} else {
    Write-Host "=============================================" -ForegroundColor Red
    Write-Host " SMOKE TESTS FAILED (DEPLOYMENT NO-GO)       " -ForegroundColor Red
    Write-Host "=============================================" -ForegroundColor Red
    exit 1
}
