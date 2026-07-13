@echo off
title ALAMS — Student Bulk Import Tool
color 0A

echo.
echo  ╔══════════════════════════════════════════════════════╗
echo  ║   ALAMS - Student Bulk Import Tool                  ║
echo  ║   Reads Excel → PostgreSQL + Offline CSV + JSON     ║
echo  ╚══════════════════════════════════════════════════════╝
echo.
echo  [STEP 1] Checking Node.js installation...

where node >nul 2>&1
if %errorlevel% neq 0 (
    echo  ERROR: Node.js is not installed or not in PATH.
    echo  Download from: https://nodejs.org/en/download
    pause
    exit /b 1
)

for /f "tokens=*" %%v in ('node --version') do set NODE_VER=%%v
echo  OK: Node.js %NODE_VER% found.
echo.

echo  [STEP 2] Checking xlsx package in server/...
if not exist "..\server\node_modules\xlsx" (
    echo  Installing xlsx into server/...
    pushd ..\server
    call npm install xlsx --silent
    popd
    echo  OK: xlsx installed.
) else (
    echo  OK: xlsx already installed.
)
echo.

echo  [STEP 3] Checking Excel data file...
if not exist "SCSIT DATA STUD.xlsx" (
    echo  ERROR: "SCSIT DATA STUD.xlsx" not found in this folder.
    echo  Please place the student Excel file in:
    echo  %~dp0
    pause
    exit /b 1
)
echo  OK: Excel file found.
echo.

echo  [STEP 4] Running import script...
echo  ──────────────────────────────────────────────────────
echo.

node "%~dp0import_students.js"

echo.
echo  ──────────────────────────────────────────────────────
echo.
if %errorlevel% neq 0 (
    echo  ❌ Import finished with errors. Check output above.
) else (
    echo  ✅ Import completed successfully!
    echo.
    echo  - Students are now live in PostgreSQL
    echo  - Credentials CSV saved in this folder
    echo  - JSON record saved in this folder
    echo  - Refresh the web admin dashboard to see all students
)

echo.
pause
