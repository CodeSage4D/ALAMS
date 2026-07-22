@echo off
REM =============================================================================
REM ALAMS - Switch Server Database to Local Offline PostgreSQL
REM =============================================================================
echo [ALAMS DATABASE] Swapping database URL to Local loopback server...

set ENV_PATH=%~dp0..\server\.env

if not exist "%ENV_PATH%" (
    echo [ERROR] server/.env file does not exist! Please create it first.
    pause
    exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -Command "(Get-Content '%ENV_PATH%') -replace '^(DATABASE_URL\s*=\s*\").*(\")', '${1}postgresql://postgres:Admin@ALAMS2026!@localhost:5432/alams_offline?schema=public${2}' -replace '^(DIRECT_URL\s*=\s*\").*(\")', '${1}postgresql://postgres:Admin@ALAMS2026!@localhost:5432/alams_offline?schema=public${2}' | Set-Content '%ENV_PATH%'"

echo [SUCCESS] Configuration swapped. Server will connect to Local database.
echo [INFO] Please restart the ALAMS server process to load the changes.
pause
