@echo off
REM =============================================================================
REM ALAMS - Server Install Script
REM =============================================================================
echo [ALAMS SERVER SETUP] Starting server dependency installation...

cd /d "%~dp0\..\server"

if not exist ".env" (
    echo [ALAMS SERVER SETUP] .env file not found. Copying .env.example...
    if exist "..\config\.env.example" (
        copy "..\config\.env.example" ".env"
    ) else (
        echo [ERROR] .env.example template not found in config/ directory.
        exit /b 1
    )
)

echo [ALAMS SERVER SETUP] Running npm install...
call npm install
if %ERRORLEVEL% neq 0 (
    echo [ERROR] npm install failed.
    exit /b 1
)

echo [ALAMS SERVER SETUP] Generating Prisma Client...
call npx prisma generate
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Prisma client generation failed.
    exit /b 1
)

echo [ALAMS SERVER SETUP] Applying database migrations...
call npx prisma db push
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Prisma db push failed.
    exit /b 1
)

echo [ALAMS SERVER SETUP] Seeding default records...
call npx ts-node prisma/seed.ts
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Database seeding failed.
    exit /b 1
)

echo [OK] ALAMS Server setup completed successfully.
exit /b 0
