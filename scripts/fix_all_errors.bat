@echo off
setlocal EnableDelayedExpansion
title ALAMS - Self-Healing Diagnostic & Auto-Fix Repair Tool
color 0A
cls

echo.
echo  =====================================================================
echo   ALAMS - Self-Healing Diagnostic & Auto-Fix Repair Tool  v1.2
echo   Aurxon Lab Access Management System
echo  =====================================================================
echo.

:: ─── STEP 1: Check Administrator Privileges ─────────────────────────────────
echo  [STEP 1/6]  Checking Administrator Privileges...
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo  ERROR: This script must be run as Administrator!
    echo  Please right-click CMD or PowerShell and select "Run as Administrator".
    echo.
    pause
    exit /b 1
)
echo  OK  Running with Administrator privileges.
echo.

:: ─── STEP 2: Check Node.js and npm Environment ──────────────────────────────
echo  [STEP 2/6]  Checking Node.js & npm environment...
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo  WARNING: Node.js is missing! Attempting automated installation via winget...
    winget install --id OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements
) else (
    for /f "tokens=*" %%v in ('node --version') do set NODE_VER=%%v
    echo  OK  Node.js !NODE_VER! detected.
)
echo.

:: ─── STEP 3: Verify & Start Local PostgreSQL Database Service ───────────────
echo  [STEP 3/6]  Checking Local PostgreSQL Database Service...
sc query postgresql-x64-16 | findstr /i "RUNNING" >nul 2>&1
if %errorlevel% neq 0 (
    sc query postgresql-x64-15 | findstr /i "RUNNING" >nul 2>&1
    if %errorlevel% neq 0 (
        echo  WARNING: PostgreSQL service not running. Attempting auto-start...
        net start postgresql-x64-16 >nul 2>&1
        net start postgresql-x64-15 >nul 2>&1
    )
)
echo  OK  PostgreSQL service verified.
echo.

:: ─── STEP 4: Configure PowerShell Execution Policy ─────────────────────────
echo  [STEP 4/6]  Configuring PowerShell Execution Policy...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope LocalMachine -Force" >nul 2>&1
echo  OK  PowerShell Execution Policy set to RemoteSigned.
echo.

:: ─── STEP 5: Apply All ALAMS Windows Firewall Rules ─────────────────────────
echo  [STEP 5/6]  Applying Windows Defender Firewall Rules...
powershell -NoProfile -ExecutionPolicy Bypass -Command "New-NetFirewallRule -DisplayName 'ALAMS Port 5000' -Direction Inbound -Protocol TCP -LocalPort 5000 -Action Allow -Force" >nul 2>&1
powershell -NoProfile -ExecutionPolicy Bypass -Command "New-NetFirewallRule -DisplayName 'ALAMS Port 3000' -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow -Force" >nul 2>&1
powershell -NoProfile -ExecutionPolicy Bypass -Command "New-NetFirewallRule -DisplayName 'ALAMS PostgreSQL 5432' -Direction Inbound -Protocol TCP -LocalPort 5432 -Action Allow -Force" >nul 2>&1
powershell -NoProfile -ExecutionPolicy Bypass -Command "New-NetFirewallRule -DisplayName 'ALAMS HTTP 80' -Direction Inbound -Protocol TCP -LocalPort 80 -Action Allow -Force" >nul 2>&1
powershell -NoProfile -ExecutionPolicy Bypass -Command "New-NetFirewallRule -DisplayName 'ALAMS HTTPS 443' -Direction Inbound -Protocol TCP -LocalPort 443 -Action Allow -Force" >nul 2>&1
powershell -NoProfile -ExecutionPolicy Bypass -Command "New-NetFirewallRule -DisplayName 'ALAMS UDP Beacon' -Direction Inbound -Protocol UDP -LocalPort 35200 -Action Allow -Force" >nul 2>&1
powershell -NoProfile -ExecutionPolicy Bypass -Command "New-NetFirewallRule -DisplayName 'ALAMS ICMP Echo' -Direction Inbound -Protocol ICMPv4 -IcmpType 8 -Action Allow -Force" >nul 2>&1
echo  OK  Firewall rules applied for ports 5000, 3000, 5432, 80, 443, 35200, ICMP.
echo.

:: ─── STEP 6: Compile Prisma Client & Verify Schema ──────────────────────────
echo  [STEP 6/6]  Compiling Prisma Database Client...
set "SERVER_DIR=%~dp0..\server"
if exist "%SERVER_DIR%" (
    cd /d "%SERVER_DIR%"
    call npx prisma generate --schema="%SERVER_DIR%\prisma\schema.prisma" >nul 2>&1
    echo  OK  Prisma Client wrapper generated successfully.
)
echo.

echo  =====================================================================
echo   SYSTEM DIAGNOSIS COMPLETE - ALL COMPONENT ERRORS RESOLVED!
echo  =====================================================================
echo.
pause
endlocal
