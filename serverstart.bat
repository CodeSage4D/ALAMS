@echo off
title ALAMS Backend Server
echo Starting ALAMS Express Backend...
cd /d "%~dp0server"
npm run start
pause
