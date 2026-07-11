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

set PG_EXE=
set PG_SRC_DIR=

REM 1. Check in script's directory (database-setup)
for %%f in ("%~dp0postgresql-*.exe") do (
    set PG_EXE=%%~nxf
    set PG_SRC_DIR=%~dp0
)

REM 2. Check in project root directory (ALAMS)
if not defined PG_EXE (
    for %%f in ("%~dp0..\postgresql-*.exe") do (
        set PG_EXE=%%~nxf
        set PG_SRC_DIR=%~dp0..\
    )
)

REM 3. Check in user's Downloads directory (highly likely for manually downloaded files)
if not defined PG_EXE (
    for %%f in ("C:\Users\%USERNAME%\Downloads\postgresql-*.exe") do (
        set PG_EXE=%%~nxf
        set PG_SRC_DIR=C:\Users\%USERNAME%\Downloads\
    )
)

REM Default fallback if no file was found
if not defined PG_EXE (
    set PG_EXE=postgresql-16.3-1-windows-x64.exe
    set PG_SRC_DIR=%~dp0
)

REM Dynamically extract major version from the installer file name
set PG_VER=16
echo %PG_EXE% | findstr /i "18." >nul && set PG_VER=18
echo %PG_EXE% | findstr /i "17." >nul && set PG_VER=17
echo %PG_EXE% | findstr /i "16." >nul && set PG_VER=16
echo %PG_EXE% | findstr /i "15." >nul && set PG_VER=15

set PG_INSTALL_DIR=C:\Program Files\PostgreSQL\%PG_VER%
echo [ALAMS DATABASE] Selected PostgreSQL Version: %PG_VER%
echo [ALAMS DATABASE] Install path will be: %PG_INSTALL_DIR%

if exist "%PG_INSTALL_DIR%\bin\pg_ctl.exe" (
    echo [INFO] PostgreSQL %PG_VER% is already installed at %PG_INSTALL_DIR%. Skipping installation.
    goto :DB_CREATE
)

if not exist "%PG_SRC_DIR%%PG_EXE%" (
    echo [INFO] PostgreSQL offline installer not found locally or in Downloads.
    echo [INFO] Downloading PostgreSQL v16.3 silent installer via PowerShell...
    Powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Write-Host 'Downloading EDB PostgreSQL Installer...' -ForegroundColor Cyan; Invoke-WebRequest -Uri 'https://sbp.enterprisedb.com/get/dbinstall?file_id=12586' -OutFile '%~dp0%PG_EXE%' -UseBasicParsing"
    if %ERRORLEVEL% neq 0 (
        echo [ERROR] Failed to download PostgreSQL installer. Please ensure internet access or place your downloaded installer in %~dp0
        pause
        exit /b 1
    )
    set PG_SRC_DIR=%~dp0
)

echo [INFO] Running PostgreSQL unattended installer...
echo [INFO] This will install PostgreSQL to: %PG_INSTALL_DIR%
echo [INFO] Default superuser password will be set to: Admin@ALAMS2026!

"%PG_SRC_DIR%%PG_EXE%" --mode unattended --unattendedmodeui none --superuserpassword "Admin@ALAMS2026!" --serverport 5432
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
REM Check connection and create database
set DB_PASS=Admin@ALAMS2026!
set PGPASSWORD=%DB_PASS%

echo [INFO] Testing PostgreSQL connection...
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

set PGPASSWORD=%DB_PASS%
psql -h localhost -U postgres -p 5432 -c "CREATE DATABASE alams_offline;" >nul 2>nul
if %ERRORLEVEL% equ 0 (
    echo [SUCCESS] Database 'alams_offline' created successfully.
) else (
    echo [INFO] Database 'alams_offline' may already exist.
)

echo [INFO] Applying Prisma schemas and seeding default tables...
cd /d "%~dp0..\server"

REM Temp update DATABASE_URL and DIRECT_DATABASE_URL to push schema offline
set DATABASE_URL=postgresql://postgres:%DB_PASS%@localhost:5432/alams_offline?schema=public
set DIRECT_URL=postgresql://postgres:%DB_PASS%@localhost:5432/alams_offline?schema=public

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
