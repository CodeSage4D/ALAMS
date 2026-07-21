@echo off
setlocal EnableDelayedExpansion
title ALAMS - Remove Client Firewall Rules
color 0C
cls

echo  =====================================================================
echo   ALAMS - Remove Client Workstation Firewall Rules
echo  =====================================================================
echo.

net session >nul 2>&1
if %errorlevel% neq 0 (
    echo  ERROR: Right-click and select "Run as Administrator".
    pause
    exit /b 1
)

echo  Removing Client Firewall Rules...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-NetFirewallRule -DisplayName 'ALAMS Client*' | Remove-NetFirewallRule -ErrorAction SilentlyContinue" >nul

echo  SUCCESS! Client Firewall Rules Removed.
pause
endlocal
