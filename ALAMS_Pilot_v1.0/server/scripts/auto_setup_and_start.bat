@echo off
title ALAMS Server Auto Setup and Start
echo =======================================================
echo          ALAMS Server Orchestrated Automation
echo =======================================================
cd /d "%~dp0"
echo [1/3] Setting up local PostgreSQL database...
call 01_setup_offline_db.bat

echo [2/3] Configuring Startup Shortcuts and Compiling GUI...
call 02_configure_startup.bat

echo [3/3] Launching interactive Command Center GUI...
call 04_run_gui.bat

echo Launching API server background process...
start cmd /c 03_run_server.bat

echo Launching Web Portal dashboard...
start cmd /c 05_run_web.bat

echo [SUCCESS] Server setup and startup completed!
pause
