@echo off
setlocal enabledelayedexpansion
title ALAMS Platform Runner

:: Check Administrator privileges
net session >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo ===================================================================
    echo [ERROR] This script must be run as an Administrator!
    echo Please right-click this file and select "Run as Administrator".
    echo ===================================================================
    pause
    exit /b 1
)

:MENU
cls
echo ===================================================================
echo                     ALAMS CENTRAL PLATFORM LAUNCHER
echo ===================================================================
echo.
echo  Please execute the following steps in sequence (1 -> 2 -> 3) to 
echo  fully configure and start the ALAMS central management services.
echo.
echo  [1] STEP 1: Run Database Setup & Migration (setup_offline_db.bat)
echo      - Auto-detects local PostgreSQL configuration.
echo      - Configures .env settings, runs Prisma db push & seeds profiles.
echo.
echo  [2] STEP 2: Configure Server Startup & GUI (configure_server_startup.bat)
echo      - Compiles and publishes the WPF central administrative Console.
echo      - Sets up Windows Registry startup keys for auto-restart on boot.
echo.
echo  [3] STEP 3: Start Central API Backend Server (serverstart.bat)
echo      - Launches the Express API & WebSocket servers on port 5000.
echo.
echo  [4] Verify Server Health & Diagnostics Checks
echo      - Runs health check metrics validation diagnostics.
echo.
echo  [5] Exit Launcher
echo.
echo ===================================================================
set /p CHOICE="Select an option (1-5): "

if "%CHOICE%"=="1" (
    echo.
    echo Launching Database Setup wizard...
    call "%~dp0setup_offline_db.bat"
    echo.
    echo Database setup complete. Returning to menu...
    pause
    goto MENU
)

if "%CHOICE%"=="2" (
    echo.
    echo Launching Startup & GUI Setup...
    call "%~dp0configure_server_startup.bat"
    echo.
    echo Startup configurations applied. Returning to menu...
    pause
    goto MENU
)

if "%CHOICE%"=="3" (
    echo.
    echo Launching Backend Server process...
    start "ALAMS Express Server" cmd.exe /c "%~dp0serverstart.bat"
    echo [OK] Server process spawned in a new window.
    pause
    goto MENU
)

if "%CHOICE%"=="4" (
    echo.
    echo Querying server health endpoints...
    if exist "%~dp0scripts\healthcheck.bat" (
        call "%~dp0scripts\healthcheck.bat"
    ) else (
        powershell -Command "try { Invoke-RestMethod -Uri 'http://localhost:5000/health' } catch { Write-Host 'Error: Server is offline' -ForegroundColor Red }"
    )
    echo.
    pause
    goto MENU
)

if "%CHOICE%"=="5" (
    exit /b 0
)

goto MENU
