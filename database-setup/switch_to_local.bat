@echo off
REM =============================================================================
REM ALAMS - Switch Server Database to Local Offline PostgreSQL
REM =============================================================================
echo [ALAMS DATABASE] Swapping datasource configuration to Local loopback server...

set ENV_PATH=%~dp0..\server\.env

echo DATABASE_URL="postgresql://postgres:Admin@ALAMS2026!@localhost:5432/alams_offline?schema=public" > "%ENV_PATH%"
echo DIRECT_URL="postgresql://postgres:Admin@ALAMS2026!@localhost:5432/alams_offline?schema=public" >> "%ENV_PATH%"
echo PORT=5000 >> "%ENV_PATH%"
echo JWT_SECRET="alams_offline_secured_secret_key_2026" >> "%ENV_PATH%"

echo [SUCCESS] Configuration swapped. Server will now connect to Local loopback database.
echo [INFO] Please restart the ALAMS server process to load the changes.
pause
