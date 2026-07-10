@echo off
REM =============================================================================
REM ALAMS - Offline Local PostgreSQL Database Auto-Installer and Schema Seed
REM =============================================================================
echo [ALAMS DATABASE] Initializing local database setup...

net session >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Please run this database installer as an ADMINISTRATOR!
    pause
    exit /b 1
)

set PG_EXE=postgresql-16.3-1-windows-x64.exe
set PG_INSTALL_DIR=C:\Program Files\PostgreSQL\16

if exist "%PG_INSTALL_DIR%\bin\pg_ctl.exe" (
    echo [INFO] PostgreSQL 16 is already installed. Skipping installation.
    goto :DB_CREATE
)

if not exist "%~dp0%PG_EXE%" (
    echo [INFO] PostgreSQL offline installer not found locally.
    echo [INFO] Downloading PostgreSQL v16.3 silent installer via PowerShell...
    Powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Write-Host 'Downloading EDB PostgreSQL Installer...' -ForegroundColor Cyan; Invoke-WebRequest -Uri 'https://sbp.enterprisedb.com/get/dbinstall?file_id=12586' -OutFile '%~dp0%PG_EXE%' -UseBasicParsing"
    if %ERRORLEVEL% neq 0 (
        echo [ERROR] Failed to download PostgreSQL installer. Please ensure internet access or place %PG_EXE% in this folder.
        pause
        exit /b 1
    )
)

echo [INFO] Running PostgreSQL unattended installer...
echo [INFO] This will install PostgreSQL to: %PG_INSTALL_DIR%
echo [INFO] Default superuser password will be set to: Admin@ALAMS2026!

"%~dp0%PG_EXE%" --mode unattended --unattendedmodeui none --superuserpassword "Admin@ALAMS2026!" --serverport 5432
if %ERRORLEVEL% neq 0 (
    echo [ERROR] PostgreSQL silent installation failed!
    pause
    exit /b 1
)

echo [SUCCESS] PostgreSQL installed successfully. Waiting for service initialization...
timeout /t 10 /nobreak >nul

:DB_CREATE
echo [INFO] Initializing ALAMS Offline Database...

REM Add PG bin to path temporarily for commands
set PATH=%PG_INSTALL_DIR%\bin;%PATH%

REM Check connection and create database
set PGPASSWORD=Admin@ALAMS2026!
psql -h localhost -U postgres -p 5432 -c "CREATE DATABASE alams_offline;" >nul 2>nul
if %ERRORLEVEL% equ 0 (
    echo [SUCCESS] Database 'alams_offline' created successfully.
) else (
    echo [INFO] Database 'alams_offline' may already exist.
)

echo [INFO] Applying Prisma schemas and seeding default tables...
cd /d "%~dp0..\server"

REM Temp update DATABASE_URL and DIRECT_DATABASE_URL to push schema offline
set DATABASE_URL=postgresql://postgres:Admin@ALAMS2026!@localhost:5432/alams_offline?schema=public
set DIRECT_URL=postgresql://postgres:Admin@ALAMS2026!@localhost:5432/alams_offline?schema=public

call npx prisma db push --accept-data-loss
if %ERRORLEVEL% equ 0 (
    echo [SUCCESS] Prisma schema pushes applied successfully.
) else (
    echo [ERROR] Failed to push schema to local PostgreSQL.
    pause
    exit /b 1
)

echo [INFO] Seeding default database profiles and credentials...
call npx ts-node prisma/seed.ts
if %ERRORLEVEL% equ 0 (
    echo [SUCCESS] Database seeded successfully.
) else (
    echo [WARN] Seed script failed or records already exist.
)

echo [SUCCESS] ALAMS Local Offline PostgreSQL Database is now fully configured!
pause
exit /b 0
