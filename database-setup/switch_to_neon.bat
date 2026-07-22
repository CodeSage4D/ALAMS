@echo off
REM =============================================================================
REM ALAMS - Switch Server Database to Cloud Neon PostgreSQL
REM =============================================================================
echo [ALAMS DATABASE] Swapping database URL to Cloud Neon server...

set ENV_PATH=%~dp0..\server\.env

if not exist "%ENV_PATH%" (
    echo [ERROR] server/.env file does not exist! Please create it first.
    pause
    exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -Command "(Get-Content '%ENV_PATH%') -replace '^(DATABASE_URL\s*=\s*\").*(\")', '${1}postgresql://neondb_owner:npg_e2TQpxgRZUG9@ep-wild-bird-atmkfndi-pooler.c-9.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require&pgbouncer=true&connect_timeout=15${2}' -replace '^(DIRECT_URL\s*=\s*\").*(\")', '${1}postgresql://neondb_owner:npg_e2TQpxgRZUG9@ep-wild-bird-atmkfndi.c-9.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require${2}' | Set-Content '%ENV_PATH%'"

echo [SUCCESS] Configuration swapped. Server will connect to Cloud Neon database.
echo [INFO] Please restart the ALAMS server process to load changes.
pause
