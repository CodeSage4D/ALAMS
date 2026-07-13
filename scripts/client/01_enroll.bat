@echo off
echo ==============================================
echo [ALAMS CLIENT] Enrolling Workstation...
echo ==============================================
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -Command "Set-ExecutionPolicy Bypass -Scope Process -Force; .\EnrollWorkstation.ps1"
pause
