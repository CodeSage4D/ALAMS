@echo off
REM =============================================================================
REM ALAMS - Server Healthcheck Script
REM =============================================================================
set SERVER_URL=http://localhost:5000
if not "%~1" == "" set SERVER_URL=%~1

echo [ALAMS HEALTHCHECK] Checking system health on: %SERVER_URL%
echo =============================================================

REM Check basic health
powershell -Command "$resp = Invoke-RestMethod -Uri '%SERVER_URL%/health' -ErrorAction SilentlyContinue; if ($resp.status -eq 'healthy') { Write-Host '[PASS] Server is healthy (status: healthy)' -ForegroundColor Green } else { Write-Host '[FAIL] Server is unresponsive or returned invalid response' -ForegroundColor Red; exit 1 }"
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Health check failed for %SERVER_URL%/health
    exit /b 1
)

REM Check diagnostics
powershell -Command "$resp = Invoke-RestMethod -Uri '%SERVER_URL%/api/v1/health/diagnostics' -ErrorAction SilentlyContinue; if ($resp.status -eq 'healthy' -and $resp.dbConnected -eq $true) { Write-Host '[PASS] Database is connected and verified.' -ForegroundColor Green; Write-Host ('       Seeded assets metrics: ' + (ConvertTo-Json $resp.metrics -Compress)) -ForegroundColor Cyan } else { Write-Host '[FAIL] Database status is offline or check failed.' -ForegroundColor Red; exit 1 }"
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Diagnostics check failed for %SERVER_URL%/api/v1/health/diagnostics
    exit /b 1
)

echo =============================================================
echo [OK] ALAMS Server healthcheck passed.
exit /b 0
