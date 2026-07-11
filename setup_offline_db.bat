@echo off
REM =============================================================================
REM ALAMS Offline Database Setup & Migration Script
REM =============================================================================
echo ===================================================================
echo         ALAMS OFFLINE DATABASE AUTO-SETUP ^& DEPLOYMENT TOOL       
echo ===================================================================
echo.

echo [INFO] Testing PostgreSQL connection...
set DB_PASS=Admin@ALAMS2026!
set PG_BIN="C:\Program Files\PostgreSQL\18\bin"
if not exist %PG_BIN% set PG_BIN="C:\Program Files\PostgreSQL\17\bin"
if not exist %PG_BIN% set PG_BIN="C:\Program Files\PostgreSQL\16\bin"
if not exist %PG_BIN% set PG_BIN="C:\Program Files\PostgreSQL\15\bin"

set PATH=%PG_BIN%;%PATH%
set PGPASSWORD=%DB_PASS%
psql -h localhost -U postgres -p 5432 -c "SELECT 1" >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [INFO] Connection failed with default admin password. Trying 'root'...
    set DB_PASS=root
    set PGPASSWORD=root
    psql -h localhost -U postgres -p 5432 -c "SELECT 1" >nul 2>nul
)
if %ERRORLEVEL% neq 0 (
    echo [INFO] Connection failed with 'root'. Trying 'postgres'...
    set DB_PASS=postgres
    set PGPASSWORD=postgres
    psql -h localhost -U postgres -p 5432 -c "SELECT 1" >nul 2>nul
)
if %ERRORLEVEL% neq 0 (
    echo.
    echo ===================================================================
    echo [WARN] All default connection attempts failed.
    echo Please enter the custom password you set during PostgreSQL install.
    echo ===================================================================
    set /p DB_PASS="Enter PostgreSQL 'postgres' password: "
)

set SERVER_DIR=%~dp0server
cd /d "%SERVER_DIR%"

echo [1/4] Configuring server/.env for offline local database...
echo # ALAMS Offline Server Configuration > .env
echo PORT=5000 >> .env
echo NODE_ENV=production >> .env
echo DATABASE_URL="postgresql://postgres:%DB_PASS%@localhost:5432/alams_offline?schema=public" >> .env
echo DIRECT_URL="postgresql://postgres:%DB_PASS%@localhost:5432/alams_offline?schema=public" >> .env
echo JWT_SECRET="aurxon-alams-jwt-secret-2026-pilot-v1" >> .env
echo QR_SIGNING_KEY="alams-qr-hmac-signing-key-2026-pilot" >> .env
echo WATCHDOG_SECRET="alams-watchdog-api-key-2026" >> .env
echo CORS_ORIGINS="http://localhost:3000,http://localhost:5000" >> .env
echo [PASS] .env configured for local PostgreSQL (localhost:5432)

echo.
echo [2/4] Generating Prisma Client...
call npx prisma generate
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Prisma generate failed. Ensure Node.js is installed and you ran 'npm install' inside the server folder.
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo [3/4] Pushing Database Schema to local PostgreSQL...
call npx prisma db push --accept-data-loss
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Database push failed. Is your local PostgreSQL server running with password 'Admin@ALAMS2026!'?
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo [4/4] Seeding Default Admin and Student Accounts...
call npx ts-node prisma/seed.ts
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Database seeding failed.
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo ===================================================================
echo         SUCCESS! ALAMS OFFLINE DATABASE IS FULLY CONFIGURED!       
echo ===================================================================
echo You can now run 'start_server.bat' to launch the ALAMS Server.
pause
