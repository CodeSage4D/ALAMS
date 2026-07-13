@echo off
echo ==============================================
echo [ALAMS SERVER] Running Offline Database Setup...
echo ==============================================
cd /d "%~dp0..\.."
call setup_offline_db.bat
