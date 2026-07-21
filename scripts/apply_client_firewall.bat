@echo off
setlocal EnableDelayedExpansion
title ALAMS - Apply Client Workstation Firewall Rules
color 0A
cls

echo  =====================================================================
echo   ALAMS - Apply Client Workstation Firewall Rules
echo  =====================================================================
echo.

net session >nul 2>&1
if %errorlevel% neq 0 (
    echo  ERROR: Right-click and select "Run as Administrator".
    pause
    exit /b 1
)

echo  Applying Client Workstation Firewall Rules...
powershell -NoProfile -ExecutionPolicy Bypass -Command "New-NetFirewallRule -DisplayName 'ALAMS Client Inbound API' -Direction Inbound -Protocol TCP -LocalPort 5000 -Action Allow -Force" >nul
powershell -NoProfile -ExecutionPolicy Bypass -Command "New-NetFirewallRule -DisplayName 'ALAMS Client UDP Discovery' -Direction Inbound -Protocol UDP -LocalPort 35200 -Action Allow -Force" >nul
powershell -NoProfile -ExecutionPolicy Bypass -Command "New-NetFirewallRule -DisplayName 'ALAMS Client Outbound Server' -Direction Outbound -Protocol TCP -RemotePort 5000 -Action Allow -Force" >nul

echo  SUCCESS! Client Firewall Rules Applied.
pause
endlocal
