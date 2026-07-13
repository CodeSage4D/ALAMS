@echo off
title ALAMS Client Auto Setup
echo =======================================================
echo          ALAMS Client Workstation Automated Installer
echo =======================================================
cd /d "%~dp0"
echo [1/2] Initiating Client Enrollment...
call 01_enroll.bat

echo [2/2] Installing restrictions and Watchdog daemon...
call 02_install_daemon.bat

echo [SUCCESS] Client workstation setup completed successfully!
pause
