@echo off
REM =============================================================================
REM ALAMS Offline Database Setup & Migration Script
REM =============================================================================
echo ===================================================================
echo         ALAMS OFFLINE DATABASE AUTO-SETUP ^& DEPLOYMENT TOOL       
echo ===================================================================
echo.

set SERVER_DIR=%~dp0server
cd /d "%SERVER_DIR%"

echo [1/4] Configuring server/.env for offline local database...
echo # ALAMS Offline Server Configuration > .env
echo PORT=5000 >> .env
echo NODE_ENV=production >> .env
echo DATABASE_URL="postgresql://postgres:Admin@ALAMS2026!@localhost:5432/alams_offline?schema=public" >> .env
echo DIRECT_URL="postgresql://postgres:Admin@ALAMS2026!@localhost:5432/alams_offline?schema=public" >> .env
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
