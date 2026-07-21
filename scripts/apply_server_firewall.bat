@echo off
setlocal EnableDelayedExpansion
title ALAMS - Apply Server Dedicated Firewall Rules
color 0A
cls

echo  =====================================================================
echo   ALAMS - Apply Server Dedicated Firewall Rules
echo  =====================================================================
echo.

net session >nul 2>&1
if %errorlevel% neq 0 (
    echo  ERROR: Right-click and select "Run as Administrator".
    pause
    exit /b 1
)

echo  Applying Server Firewall Rules (Ports 5000, 3000, 5432, 80, 443, 35200, ICMP)...
powershell -NoProfile -ExecutionPolicy Bypass -Command "New-NetFirewallRule -DisplayName 'ALAMS Port 5000' -Direction Inbound -Protocol TCP -LocalPort 5000 -Action Allow -Force" >nul
powershell -NoProfile -ExecutionPolicy Bypass -Command "New-NetFirewallRule -DisplayName 'ALAMS Port 3000' -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow -Force" >nul
powershell -NoProfile -ExecutionPolicy Bypass -Command "New-NetFirewallRule -DisplayName 'ALAMS PostgreSQL 5432' -Direction Inbound -Protocol TCP -LocalPort 5432 -Action Allow -Force" >nul
powershell -NoProfile -ExecutionPolicy Bypass -Command "New-NetFirewallRule -DisplayName 'ALAMS HTTP 80' -Direction Inbound -Protocol TCP -LocalPort 80 -Action Allow -Force" >nul
powershell -NoProfile -ExecutionPolicy Bypass -Command "New-NetFirewallRule -DisplayName 'ALAMS HTTPS 443' -Direction Inbound -Protocol TCP -LocalPort 443 -Action Allow -Force" >nul
powershell -NoProfile -ExecutionPolicy Bypass -Command "New-NetFirewallRule -DisplayName 'ALAMS UDP Beacon' -Direction Inbound -Protocol UDP -LocalPort 35200 -Action Allow -Force" >nul
powershell -NoProfile -ExecutionPolicy Bypass -Command "New-NetFirewallRule -DisplayName 'ALAMS ICMP Echo' -Direction Inbound -Protocol ICMPv4 -IcmpType 8 -Action Allow -Force" >nul

echo  SUCCESS! All Server Firewall Rules Applied.
pause
endlocal
