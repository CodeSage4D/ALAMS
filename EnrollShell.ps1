# =============================================================================
# EnrollShell.ps1 - ALAMS Student Shell Enrollment Script
# =============================================================================
# PURPOSE:
#   Configures the currently logged-in Windows user account to load the ALAMS
#   Lock Screen as its shell instead of Windows Explorer (explorer.exe).
#   Run this script once per student account on each lab workstation.
#
# USAGE:
#   Run as ADMINISTRATOR on each target student workstation.
#   Script must be executed while logged in AS (or impersonating) the student
#   user account that will be restricted.
#
# PREREQUISITES:
#   - ALAMS Client must be installed at: C:\Program Files\ALAMS\AlamsClient.exe
#   - AlamsWatchdog service must be installed and running (via MSI installer)
#   - Server URL and Computer ID must already be configured in:
#     C:\ProgramData\ALAMS\config.json
#
# DEPLOYMENT METHOD:
#   Option A: Run manually on each workstation.
#   Option B: Deploy via Group Policy (see walkthrough_phase2.md Method B).
#   Option C: Run via startup script targeting the student OU.
# =============================================================================

param (
    [string]$AlamsClientPath = "C:\Program Files\ALAMS\AlamsClient.exe",
    [string]$StudentUser = ""
)

$ErrorActionPreference = "Stop"

Write-Host "============================================" -ForegroundColor Cyan
Write-Host " ALAMS - Student Shell Enrollment Script    " -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# --- Step 1: Validate ALAMS Client exists ---
if (-not (Test-Path $AlamsClientPath)) {
    Write-Host "[ERROR] AlamsClient.exe not found at: $AlamsClientPath" -ForegroundColor Red
    Write-Host "        Please ensure the ALAMS MSI installer has been run first." -ForegroundColor Red
    exit 1
}
Write-Host "[OK] ALAMS Client binary found: $AlamsClientPath" -ForegroundColor Green

# --- Step 2: Validate config.json is provisioned ---
$ConfigPath = "C:\ProgramData\ALAMS\config.json"
if (-not (Test-Path $ConfigPath)) {
    Write-Host "[WARN] config.json not found at: $ConfigPath" -ForegroundColor Yellow
    Write-Host "       The workstation may not be registered with the server yet." -ForegroundColor Yellow
    Write-Host "       Shell enrollment will proceed. Registration must be completed separately." -ForegroundColor Yellow
} else {
    Write-Host "[OK] ALAMS config.json found." -ForegroundColor Green
}

# --- Step 3: Check if Watchdog service is installed ---
$watchdogSvc = Get-Service -Name "AlamsDaemon" -ErrorAction SilentlyContinue
if (-not $watchdogSvc) {
    $watchdogSvc = Get-Service -Name "AlamsWatchdog" -ErrorAction SilentlyContinue
}
if (-not $watchdogSvc) {
    Write-Host "[WARN] AlamsDaemon / AlamsWatchdog service is NOT installed." -ForegroundColor Yellow
    Write-Host "       Install the client first before running this script on student machines." -ForegroundColor Yellow
} elseif ($watchdogSvc.Status -ne "Running") {
    Write-Host "[WARN] Service is installed but NOT running. Starting it..." -ForegroundColor Yellow
    Start-Service -Name $watchdogSvc.Name
    Write-Host "[OK] Service started." -ForegroundColor Green
} else {
    Write-Host "[OK] Service is ACTIVE." -ForegroundColor Green
}

# --- Step 4: Apply shell override for the target student user ---
if ($StudentUser -ne "") {
    $UserHivePath = "C:\Users\$StudentUser\NTUSER.DAT"
    if (Test-Path $UserHivePath) {
        Write-Host "[INFO] Loading registry hive for user: $StudentUser" -ForegroundColor Cyan
        
        reg load HKU\StudentHive $UserHivePath
        
        $RegistryPath = "Registry::HKEY_USERS\StudentHive\Software\Microsoft\Windows NT\CurrentVersion\Winlogon"
        if (-not (Test-Path $RegistryPath)) {
            New-Item -Path $RegistryPath -Force | Out-Null
        }
        
        $currentShell = (Get-ItemProperty -Path $RegistryPath -Name "Shell" -ErrorAction SilentlyContinue).Shell
        Set-ItemProperty -Path $RegistryPath -Name "Shell" -Value $AlamsClientPath -Force
        Write-Host "[OK] Custom shell enrolled for user $StudentUser -> $AlamsClientPath" -ForegroundColor Green
        
        # Backup original shell
        $BackupPath = "C:\ProgramData\ALAMS\shell_backup_$StudentUser.txt"
        $originalShell = if ($currentShell) { $currentShell } else { "explorer.exe" }
        Set-Content -Path $BackupPath -Value $originalShell -Force
        
        [gc]::collect()
        [gc]::WaitForPendingFinalizers()
        reg unload HKU\StudentHive
        Write-Host "[OK] Registry hive unloaded successfully." -ForegroundColor Green
    } else {
        Write-Host "[ERROR] Could not locate NTUSER.DAT for user: $StudentUser" -ForegroundColor Red
        exit 1
    }
} else {
    # Default to current user hive
    $RegistryPath = "HKCU:\Software\Microsoft\Windows NT\CurrentVersion\Winlogon"
    if (-not (Test-Path $RegistryPath)) {
        New-Item -Path $RegistryPath -Force | Out-Null
    }
    $currentShell = (Get-ItemProperty -Path $RegistryPath -Name "Shell" -ErrorAction SilentlyContinue).Shell
    Set-ItemProperty -Path $RegistryPath -Name "Shell" -Value $AlamsClientPath -Force
    Write-Host "[OK] Custom shell enrolled for current user -> $AlamsClientPath" -ForegroundColor Green
    
    $BackupPath = "C:\ProgramData\ALAMS\shell_backup.txt"
    $originalShell = if ($currentShell) { $currentShell } else { "explorer.exe" }
    Set-Content -Path $BackupPath -Value $originalShell -Force
}

# --- Step 5: Create ProgramData directory if missing ---
$AlamsProgramData = "C:\ProgramData\ALAMS"
if (-not (Test-Path $AlamsProgramData)) {
    New-Item -ItemType Directory -Path $AlamsProgramData -Force | Out-Null
    Write-Host "[OK] Created ProgramData\ALAMS directory." -ForegroundColor Green
}

# --- Step 6: Summary ---
Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host " Enrollment Complete!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host " - Shell override: ACTIVE" -ForegroundColor Green
Write-Host " - ALAMS Client: $AlamsClientPath" -ForegroundColor Green
Write-Host " - Config path: $ConfigPath" -ForegroundColor Green
Write-Host ""
Write-Host " NEXT STEPS:" -ForegroundColor Yellow
Write-Host "   1. Log out and log back in as the student user to apply the new shell." -ForegroundColor Yellow
Write-Host "   2. Ensure the server is running: http://localhost:5000/health" -ForegroundColor Yellow
Write-Host "   3. Approve this workstation via the ALAMS Admin Dashboard." -ForegroundColor Yellow
Write-Host ""
