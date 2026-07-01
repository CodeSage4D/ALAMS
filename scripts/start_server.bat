@echo off
REM =============================================================================
REM ALAMS - Server Start Script
REM =============================================================================
echo [ALAMS SERVER] Starting central server...

cd /d "%~dp0\..\server"

if not exist "dist\index.js" (
    echo [ALAMS SERVER] Production build not found. Running npm run build...
    call npm run build
    if %ERRORLEVEL% neq 0 (
        echo [ERROR] Build failed. Cannot start server.
        exit /b 1
    )
)

echo [ALAMS SERVER] Launching service on http://localhost:5000...
call npm start
exit /b 0
