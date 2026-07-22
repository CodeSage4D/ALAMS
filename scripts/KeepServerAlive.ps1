# ALAMS Always-Active Persistent Server Watchdog Supervisor
# Guarantees Node.js server runs 24/7 with auto-healing restart on crash

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ServerDir = Resolve-Path "$ScriptDir\..\server"

Write-Host "=====================================================================" -ForegroundColor Green
Write-Host "  ALAMS Always-Active Server Supervisor Watchdog" -ForegroundColor Cyan
Write-Host "  Monitoring: http://localhost:5000" -ForegroundColor Yellow
Write-Host "=====================================================================" -ForegroundColor Green

Set-Location $ServerDir

while ($true) {
    Write-Host "[SUPERVISOR] Starting ALAMS Server Process..." -ForegroundColor Green
    
    $serverProcess = Start-Process -FilePath "npm.cmd" -ArgumentList "run dev" -WorkingDirectory $ServerDir -PassThru -NoNewWindow

    # Monitor process and HTTP health
    while (-not $serverProcess.HasExited) {
        Start-Sleep -Seconds 3
        try {
            $health = Invoke-RestMethod -Uri "http://localhost:5000/health" -TimeoutSec 3 -ErrorAction Stop
            if ($health.status -ne "healthy" -or $health.dbStatus -ne "CONNECTED") {
                Write-Host "[SUPERVISOR WARNING] Server returned unhealthy diagnostic state!" -ForegroundColor Yellow
            }
        }
        catch {
            Write-Host "[SUPERVISOR ALERT] HTTP Ping failed: $_" -ForegroundColor Red
        }
    }

    Write-Host "[SUPERVISOR WARNING] Server process exited with code $($serverProcess.ExitCode). Restarting in 2 seconds..." -ForegroundColor Red
    Start-Sleep -Seconds 2
}
