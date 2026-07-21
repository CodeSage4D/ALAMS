@echo off
setlocal EnableDelayedExpansion
title ALAMS - Remove Server Firewall Rules
color 0C
cls

echo  =====================================================================
echo   ALAMS - Remove Server Firewall Rules
echo  =====================================================================
echo.

net session >nul 2>&1
if %errorlevel% neq 0 (
    echo  ERROR: Right-click and select "Run as Administrator".
    pause
    exit /b 1
)

echo  Removing all ALAMS Server Firewall Rules...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-NetFirewallRule -DisplayName 'ALAMS*' | Remove-NetFirewallRule -ErrorAction SilentlyContinue" >nul

echo  SUCCESS! All Server Firewall Rules Removed.
pause
endlocal
