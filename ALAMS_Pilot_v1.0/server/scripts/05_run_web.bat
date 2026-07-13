@echo off
echo ==============================================
echo [ALAMS SERVER] Launching Web Portal Dashboard...
echo ==============================================
cd /d "%~dp0..\..\web"
call npm run start
