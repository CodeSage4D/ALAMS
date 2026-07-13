@echo off
setlocal EnableDelayedExpansion
title ALAMS — Student Bulk Import
color 0A
cls

echo.
echo  =====================================================================
echo   ALAMS - Student Bulk Import Tool  v1.1
echo   Aurxon Lab Access Management System
echo  =====================================================================
echo.

:: ─── Set working directory to this script's folder ────────────────────────────
cd /d "%~dp0"
echo  Working directory: %~dp0
echo.

:: ─── STEP 1: Check Node.js ────────────────────────────────────────────────────
echo  [STEP 1/5]  Checking Node.js installation...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo  ERROR: Node.js is NOT installed or not in PATH.
    echo.
    echo  To install Node.js:
    echo    1. Open browser  ^>  https://nodejs.org/en/download
    echo    2. Download the Windows Installer (.msi)  LTS version
    echo    3. Install with default settings
    echo    4. RESTART this CMD window and run this BAT again
    echo.
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('node --version') do set NODE_VER=%%v
echo  OK  Node.js %NODE_VER%
echo.

:: ─── STEP 2: Check server folder ─────────────────────────────────────────────
echo  [STEP 2/5]  Checking server folder...
if not exist "..\server\package.json" (
    echo.
    echo  ERROR: server\package.json not found.
    echo  Make sure this script is inside the Student-Data\ folder of ALAMS.
    echo.
    pause
    exit /b 1
)
echo  OK  server\ folder found
echo.

:: ─── STEP 3: Install server npm packages ──────────────────────────────────────
echo  [STEP 3/5]  Installing server packages (npm install)...
cd /d "%~dp0..\server"
call npm install --prefer-offline --loglevel error 2>&1
if %errorlevel% neq 0 (
    echo.
    echo  WARNING: npm install had issues. Trying again with verbose output...
    call npm install
)

:: Install xlsx specifically
call npm install xlsx --prefer-offline --loglevel error 2>&1
echo  OK  Packages installed
cd /d "%~dp0"
echo.

:: ─── STEP 4: Check Excel file ─────────────────────────────────────────────────
echo  [STEP 4/5]  Checking student Excel file...
if not exist "SCSIT DATA STUD.xlsx" (
    echo.
    echo  ERROR: Excel file not found!
    echo.
    echo  Expected file:
    echo    %~dp0SCSIT DATA STUD.xlsx
    echo.
    echo  Place the student data Excel file in this folder and run again.
    echo.
    pause
    exit /b 1
)
echo  OK  "SCSIT DATA STUD.xlsx" found
echo.

:: ─── STEP 5: Run import script ────────────────────────────────────────────────
echo  [STEP 5/5]  Running student import script...
echo  ---------------------------------------------------------------------
echo.

node "%~dp0import_students.js"
set IMPORT_EXIT=%errorlevel%

echo.
echo  ---------------------------------------------------------------------
echo.

if %IMPORT_EXIT% neq 0 (
    echo  IMPORT FAILED with error code %IMPORT_EXIT%
    echo.
    echo  Common fixes:
    echo    ^> Check your internet connection (PostgreSQL is on Neon cloud)
    echo    ^> Make sure server\.env has the correct DATABASE_URL
    echo    ^> Run:  cd ..\server  ^&^&  npx prisma generate
    echo.
) else (
    echo  =====================================================================
    echo   IMPORT COMPLETED SUCCESSFULLY!
    echo  =====================================================================
    echo.
    echo   1. Students are now saved in PostgreSQL database
    echo   2. Credentials CSV file saved in this folder
    echo   3. Import JSON record saved in this folder
    echo.
    echo   NEXT STEPS - REBUILD AND RESTART THE WEB PORTAL:
    echo   -------------------------------------------------
    echo   Open a new CMD and run these commands in order:
    echo.
    echo     cd /d "%~dp0..\web"
    echo     npm run build
    echo     :: Then stop and restart the web server (pm2 or node)
    echo.
    echo   OR if using pm2:
    echo     pm2 restart alams-web
    echo     pm2 restart alams-server
    echo.
    echo   Then open the admin dashboard and click "Refresh Deck".
    echo.
)

pause
endlocal
