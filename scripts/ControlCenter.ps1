# =============================================================================
# ALAMS Operations Console - Control Center
# =============================================================================
# Description: Dedicated administrative operations console for university IT staff.
# Usage: powershell -ExecutionPolicy Bypass -File ControlCenter.ps1
# =============================================================================

$ErrorActionPreference = "SilentlyContinue"

# Configure Server Details
$ServerBaseUrl = "http://localhost:5000"
$DashboardUrl = "http://localhost:3000"
$LogsDir = "$PSScriptRoot\..\server"
$BackupsDir = "$PSScriptRoot\..\backups"

function Show-Header {
    Clear-Host
    Write-Host "=====================================================================" -ForegroundColor Cyan
    Write-Host "                 ALAMS ENTERPRISE CONTROL CENTER                     " -ForegroundColor Cyan
    Write-Host "=====================================================================" -ForegroundColor Cyan
    Write-Host "  Server API  : $ServerBaseUrl" -ForegroundColor White
    Write-Host "  Dashboard   : $DashboardUrl" -ForegroundColor White
    
    # Check Server Running State
    $status = Test-ServerConnection
    if ($status -eq "UP") {
        Write-Host "  System State: " -NoNewline; Write-Host "ONLINE (UP)" -ForegroundColor Green
    } else {
        Write-Host "  System State: " -NoNewline; Write-Host "OFFLINE (DOWN)" -ForegroundColor Red
    }
    Write-Host "=====================================================================" -ForegroundColor Cyan
}

function Test-ServerConnection {
    try {
        $resp = Invoke-RestMethod -Uri "$ServerBaseUrl/health" -Method Get -TimeoutSec 2
        if ($resp.status -eq "healthy") { return "UP" }
    } catch {}
    return "DOWN"
}

function Start-AlamsServer {
    Write-Host "[INFO] Checking server state..." -ForegroundColor Cyan
    $status = Test-ServerConnection
    if ($status -eq "UP") {
        Write-Host "[WARN] Server is already running." -ForegroundColor Yellow
        Read-Enter
        return
    }
    
    Write-Host "[INFO] Starting ALAMS Central Server in a background process..." -ForegroundColor Cyan
    Start-Process cmd.exe -ArgumentList "/k `"$PSScriptRoot\start_server.bat`"" -WindowStyle Normal
    Start-Sleep -Seconds 3
    
    $status = Test-ServerConnection
    if ($status -eq "UP") {
        Write-Host "[PASS] ALAMS Server launched successfully." -ForegroundColor Green
    } else {
        Write-Host "[WARN] Server process started. Check health status shortly." -ForegroundColor Yellow
    }
    Read-Enter
}

function Stop-AlamsServer {
    Write-Host "[INFO] Stopping ALAMS Central Server..." -ForegroundColor Cyan
    cmd.exe /c "`"$PSScriptRoot\stop_server.bat`""
    Read-Enter
}

function Restart-AlamsServer {
    Write-Host "[INFO] Restarting ALAMS Central Server..." -ForegroundColor Cyan
    cmd.exe /c "`"$PSScriptRoot\stop_server.bat`""
    Start-Sleep -Seconds 2
    Start-Process cmd.exe -ArgumentList "/k `"$PSScriptRoot\start_server.bat`"" -WindowStyle Normal
    Start-Sleep -Seconds 3
    
    $status = Test-ServerConnection
    if ($status -eq "UP") {
        Write-Host "[PASS] ALAMS Server restarted and verified." -ForegroundColor Green
    } else {
        Write-Host "[WARN] Server restarted. Validate connectivity manually." -ForegroundColor Yellow
    }
    Read-Enter
}


function Backup-Database {
    Write-Host "[INFO] Triggering Database Backup..." -ForegroundColor Cyan
    & "$PSScriptRoot\backup_database.bat"
    Read-Enter
}

function Restore-Database {
    Write-Host "[INFO] Preparing Database Restore..." -ForegroundColor Cyan
    $files = Get-ChildItem -Path $BackupsDir -Filter "*.sql"
    if ($files.Count -eq 0) {
        Write-Host "[WARN] No SQL backup files found in: $BackupsDir" -ForegroundColor Yellow
        Read-Enter
        return
    }
    
    Write-Host "Available Backups:" -ForegroundColor Cyan
    for ($i = 0; $i -lt $files.Count; $i++) {
        Write-Host "  [$($i + 1)] $($files[$i].Name) ($($files[$i].Length / 1KB) KB)" -ForegroundColor White
    }
    
    Write-Host ""
    $choice = Read-Host "Select backup index to restore (or enter to cancel)"
    if ([string]::IsNullOrEmpty($choice)) { return }
    
    $idx = [int]$choice - 1
    if ($idx -lt 0 -or $idx -ge $files.Count) {
        Write-Host "[ERROR] Invalid selection." -ForegroundColor Red
        Read-Enter
        return
    }
    
    $targetFile = $files[$idx].Name
    Write-Host "[CAUTION] This action will overwrite existing records. Proceed? (y/n): " -NoNewline -ForegroundColor Red
    $confirm = Read-Host
    if ($confirm.ToLower() -eq 'y') {
        & "$PSScriptRoot\restore_database.bat" "$targetFile"
    } else {
        Write-Host "[INFO] Restore operation cancelled." -ForegroundColor Cyan
    }
    Read-Enter
}

function View-ConnectedClients {
    Write-Host "[INFO] Querying active workstation assets..." -ForegroundColor Cyan
    try {
        $resp = Invoke-RestMethod -Uri "$ServerBaseUrl/api/v1/admin/computers" -Method Get -TimeoutSec 3
        if ($resp) {
            Write-Host "Hostname`t`tPC Number`tIP Address`tStatus`tWatchdog" -ForegroundColor Cyan
            Write-Host "---------------------------------------------------------------------"
            foreach ($pc in $resp) {
                $wdStatus = if ($pc.watchdogHeartbeat) { "Active" } else { "Offline" }
                Write-Host "$($pc.deviceName.PadRight(15))`t$($pc.pcNumber)`t$($pc.ipAddress)`t$($pc.status)`t$wdStatus"
            }
        }
    } catch {
        Write-Host "[ERROR] Could not query computer lists from server API." -ForegroundColor Red
    }
    Read-Enter
}

function View-ActiveSessions {
    Write-Host "[INFO] Querying active student lockscreen sessions..." -ForegroundColor Cyan
    try {
        $resp = Invoke-RestMethod -Uri "$ServerBaseUrl/api/v1/admin/sessions/active" -Method Get -TimeoutSec 3
        if ($resp.Count -eq 0 -or -not $resp) {
            Write-Host "No active student sessions detected." -ForegroundColor Yellow
        } else {
            Write-Host "Student Name`tEnrollment`tWorkstation`tLogin Time" -ForegroundColor Cyan
            Write-Host "---------------------------------------------------------------------"
            foreach ($sess in $resp) {
                Write-Host "$($sess.user.fullName.PadRight(15))`t$($sess.user.enrollmentNumber)`t$($sess.computer.deviceName)`t$($sess.loginTime)"
            }
        }
    } catch {
        Write-Host "[ERROR] Could not retrieve active sessions from server API." -ForegroundColor Red
    }
    Read-Enter
}

function Open-Dashboard {
    Write-Host "[INFO] Opening Admin Dashboard in default browser..." -ForegroundColor Cyan
    Start-Process $DashboardUrl
}

function Check-Health {
    & "$PSScriptRoot\healthcheck.bat"
    Read-Enter
}

function View-Logs {
    Write-Host "Select log file to view:" -ForegroundColor Cyan
    Write-Host "  [1] Startup Log (server_startup.log)"
    Write-Host "  [2] Error Log (server_error.log)"
    Write-Host "  [3] Go back"
    Write-Host ""
    $choice = Read-Host "Choice"
    
    switch ($choice) {
        "1" {
            $logPath = "$LogsDir\server_startup.log"
            if (Test-Path $logPath) { Get-Content $logPath -Tail 50 } else { Write-Host "Log file not found." }
        }
        "2" {
            $logPath = "$LogsDir\server_error.log"
            if (Test-Path $logPath) { Get-Content $logPath -Tail 50 } else { Write-Host "Log file not found." }
        }
    }
    Read-Enter
}

function System-Diagnostics {
    Write-Host "[INFO] Fetching diagnostics report from server..." -ForegroundColor Cyan
    try {
        $resp = Invoke-RestMethod -Uri "$ServerBaseUrl/api/v1/health/diagnostics" -Method Get -TimeoutSec 3
        Write-Host "Diagnostic Metrics:" -ForegroundColor Cyan
        Write-Host "  Status      : $($resp.status)"
        Write-Host "  Timestamp   : $($resp.timestamp)"
        Write-Host "  DB Link     : $($resp.dbConnected)"
        Write-Host "  Lab Zones   : $($resp.metrics.labs)"
        Write-Host "  Computers   : $($resp.metrics.computers)"
        Write-Host "  Profiles    : $($resp.metrics.profiles)"
        Write-Host "  Subjects    : $($resp.metrics.subjects)"
        Write-Host "  Subnet Audit: $($resp.subnetStatus)"
        if ($resp.warnings.Count -gt 0) {
            Write-Host "Warnings:" -ForegroundColor Yellow
            foreach ($warn in $resp.warnings) {
                Write-Host "  - $warn" -ForegroundColor Yellow
            }
        }
    } catch {
        Write-Host "[ERROR] Failed to contact diagnostics API endpoint." -ForegroundColor Red
    }
    Read-Enter
}

function Read-Enter {
    Write-Host ""
    Write-Host "Press ENTER to return to menu..." -ForegroundColor Gray
    Read-Host
}

# --- Main Console Loop ---
do {
    Show-Header
    Write-Host "  [1]  Start ALAMS Server" -ForegroundColor White
    Write-Host "  [2]  Stop ALAMS Server" -ForegroundColor White
    Write-Host "  [3]  Restart ALAMS Server" -ForegroundColor White
    Write-Host "  [4]  View Active Workstations (Paired)" -ForegroundColor White
    Write-Host "  [5]  View Active Sessions (Unlocked)" -ForegroundColor White
    Write-Host "  [6]  Database Backup" -ForegroundColor White
    Write-Host "  [7]  Database Restore" -ForegroundColor White
    Write-Host "  [8]  Open Web Admin Dashboard" -ForegroundColor White
    Write-Host "  [9]  Check Server Health" -ForegroundColor White
    Write-Host "  [10] View Server Logs" -ForegroundColor White
    Write-Host "  [11] System Diagnostics Audit" -ForegroundColor White
    Write-Host "  [12] Exit Console" -ForegroundColor White
    Write-Host ""
    $option = Read-Host "Select Operation (1-12)"
    
    switch ($option) {
        "1" { Start-AlamsServer }
        "2" { Stop-AlamsServer }
        "3" { Restart-AlamsServer }
        "4" { View-ConnectedClients }
        "5" { View-ActiveSessions }
        "6" { Backup-Database }
        "7" { Restore-Database }
        "8" { Open-Dashboard }
        "9" { Check-Health }
        "10" { View-Logs }
        "11" { System-Diagnostics }
    }
} while ($option -ne "12")

Write-Host "Console Exited."
