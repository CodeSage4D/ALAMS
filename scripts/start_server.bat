@echo off
REM =============================================================================
REM ALAMS - Server Start Script with Self-Healing Infinite Restart Loop
REM =============================================================================
echo [ALAMS SERVER] Starting central server...

cd /d "%~dp0\..\server"
set LOG_FILE=server_startup.log

if not exist "dist\index.js" (
    echo [%date% %time%] [ALAMS SERVER] Production build not found. Running npm run build... >> "%LOG_FILE%"
    call npm run build >> "%LOG_FILE%" 2>&1
    if %ERRORLEVEL% neq 0 (
        echo [%date% %time%] [ERROR] Build failed. Cannot start server. >> "%LOG_FILE%"
        exit /b 1
    )
)

:start
echo [%date% %time%] [ALAMS SERVER] Launching service on http://localhost:5000... >> "%LOG_FILE%"
echo [ALAMS SERVER] Launching service on http://localhost:5000...
node dist/index.js >> "%LOG_FILE%" 2>&1
set EXIT_CODE=%ERRORLEVEL%
echo [%date% %time%] [ERROR] Server exited with code %EXIT_CODE%. Automatically retrying in 10 seconds... >> "%LOG_FILE%"
echo [ERROR] Server exited with code %EXIT_CODE%. Automatically retrying in 10 seconds...
timeout /t 10
goto start
