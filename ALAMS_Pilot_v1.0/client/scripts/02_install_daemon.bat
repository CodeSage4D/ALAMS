@echo off
echo ==============================================
echo [ALAMS CLIENT] Installing Watchdog Daemon Service...
echo ==============================================
cd /d "%~dp0"
net session >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] This script must be run as an Administrator!
    pause
    exit /b 1
)
call install_client.bat
