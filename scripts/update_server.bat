@echo off
REM =============================================================================
REM ALAMS - Server Update Script
REM =============================================================================
echo [ALAMS SERVER UPDATE] Pulling latest repository updates...

cd /d "%~dp0\.."

call git pull
if %ERRORLEVEL% neq 0 (
    echo [WARN] git pull failed or repository not initialized with git. Continuing dependencies check...
)

cd /d "%~dp0\..\server"

echo [ALAMS SERVER UPDATE] Updating dependencies...
call npm install
if %ERRORLEVEL% neq 0 (
    echo [ERROR] npm install failed.
    exit /b 1
)

echo [ALAMS SERVER UPDATE] Re-generating Prisma Client...
call npx prisma generate
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Prisma client generation failed.
    exit /b 1
)

echo [ALAMS SERVER UPDATE] Executing migrations...
call npx prisma db push
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Prisma db push failed.
    exit /b 1
)

echo [OK] Server update completed.
exit /b 0
