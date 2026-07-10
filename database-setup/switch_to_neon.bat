@echo off
REM =============================================================================
REM ALAMS - Switch Server Database to Cloud Neon PostgreSQL
REM =============================================================================
echo [ALAMS DATABASE] Swapping datasource configuration to Cloud Neon server...

set ENV_PATH=%~dp0..\server\.env

echo DATABASE_URL="postgresql://neondb_owner:npg_c9bZ5mUPwRSp@ep-wild-bird-atmkfndi.c-9.us-east-1.aws.neon.tech/neondb?sslmode=require" > "%ENV_PATH%"
echo DIRECT_URL="postgresql://neondb_owner:npg_c9bZ5mUPwRSp@ep-wild-bird-atmkfndi.c-9.us-east-1.aws.neon.tech/neondb?sslmode=require" >> "%ENV_PATH%"
echo PORT=5000 >> "%ENV_PATH%"
echo JWT_SECRET="alams_secured_secret_key_2026" >> "%ENV_PATH%"

echo [SUCCESS] Configuration swapped. Server will now connect to Cloud Neon database.
echo [INFO] Please restart the ALAMS server process to load the changes.
pause
