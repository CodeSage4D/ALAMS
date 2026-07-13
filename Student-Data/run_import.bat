@echo off
setlocal EnableDelayedExpansion
title ALAMS - Student Bulk Import
color 0A
cls

echo.
echo  =====================================================================
echo   ALAMS - Student Bulk Import Tool  v1.2
echo   Aurxon Lab Access Management System
echo  =====================================================================
echo.

:: ─── Force-set working directory to THIS bat file's folder ───────────────────
:: This fixes "cannot find path" when double-clicked from Explorer
set "SCRIPT_DIR=%~dp0"
:: Remove trailing backslash
if "%SCRIPT_DIR:~-1%"=="\" set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"

set "SERVER_DIR=%SCRIPT_DIR%\..\server"
set "WEB_DIR=%SCRIPT_DIR%\..\web"
set "EXCEL_FILE=%SCRIPT_DIR%\SCSIT DATA STUD.xlsx"
set "IMPORT_JS=%SCRIPT_DIR%\import_students.js"

echo  Script folder : %SCRIPT_DIR%
echo  Server folder : %SERVER_DIR%
echo  Excel file    : %EXCEL_FILE%
echo.

:: ─── STEP 1: Verify Excel file exists ────────────────────────────────────────
echo  [STEP 1/5]  Checking Excel file...
if not exist "%EXCEL_FILE%" (
    echo.
    echo  ERROR: Excel file NOT found!
    echo.
    echo  Looking for:
    echo    %EXCEL_FILE%
    echo.
    echo  The file "SCSIT DATA STUD.xlsx" must be placed inside:
    echo    %SCRIPT_DIR%\
    echo.
    echo  Current files in this folder:
    dir "%SCRIPT_DIR%" /b
    echo.
    pause
    exit /b 1
)
echo  OK  Excel file found.
echo.

:: ─── STEP 2: Check Node.js ───────────────────────────────────────────────────
echo  [STEP 2/5]  Checking Node.js...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo  ERROR: Node.js is NOT installed.
    echo  Download: https://nodejs.org  (LTS version)
    echo  After install, restart CMD and run this BAT again.
    echo.
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('node --version') do set NODE_VER=%%v
echo  OK  Node.js %NODE_VER%
echo.

:: ─── STEP 3: Install server npm packages ─────────────────────────────────────
echo  [STEP 3/5]  Installing server packages...
cd /d "%SERVER_DIR%"
if %errorlevel% neq 0 (
    echo  ERROR: Cannot navigate to server folder: %SERVER_DIR%
    pause
    exit /b 1
)
echo  Running npm install in: %CD%
call npm install --loglevel error
if %errorlevel% neq 0 (
    echo  WARNING: npm install reported errors. Continuing...
)
call npm install xlsx --loglevel error
echo  OK  Packages ready.
echo.

:: ─── STEP 4: Generate Prisma client ──────────────────────────────────────────
echo  [STEP 4/5]  Generating Prisma client...
call npx prisma generate --schema="%SERVER_DIR%\prisma\schema.prisma" 2>&1
echo  OK  Prisma client generated.
echo.

:: ─── STEP 5: Run import ──────────────────────────────────────────────────────
echo  [STEP 5/5]  Running student import...
echo  ---------------------------------------------------------------------
echo.
cd /d "%SCRIPT_DIR%"
node "%IMPORT_JS%"
set IMPORT_CODE=%errorlevel%

echo.
echo  ---------------------------------------------------------------------
echo.

if %IMPORT_CODE% neq 0 (
    echo  *** IMPORT FAILED (exit code: %IMPORT_CODE%) ***
    echo.
    echo  Troubleshooting:
    echo   1. Check internet connection (database is on Neon cloud)
    echo   2. Verify DATABASE_URL in: %SERVER_DIR%\.env
    echo   3. Run manually: node "%IMPORT_JS%"
    echo.
) else (
    echo  *** IMPORT SUCCESSFUL! ***
    echo.
    echo  Students saved to PostgreSQL database.
    echo  Credentials CSV and JSON saved in: %SCRIPT_DIR%
    echo.
    echo  -------------------------------------------------------
    echo  TO SEE STUDENTS ON THE WEB - REBUILD WEB PORTAL:
    echo  -------------------------------------------------------
    echo  Run these commands in CMD:
    echo.
    echo    cd /d "%WEB_DIR%"
    echo    npm run build
    echo    pm2 restart alams-web    (if using pm2)
    echo.
    echo  Then open admin dashboard and click "Refresh Deck".
    echo.
)

pause
endlocal
