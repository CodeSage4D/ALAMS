@echo off
REM =============================================================================
REM ALAMS - Offline Local USB Pendrive Client Installer / Updater
REM =============================================================================
echo [ALAMS USB INSTALL] Installing/Updating client from USB drive...

net session >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Please run this installer as an ADMINISTRATOR!
    pause
    exit /b 1
)

set INSTALL_DIR=C:\Program Files\ALAMS

REM Stop Watchdog Daemon service
sc query AlamsDaemon >nul 2>nul
if %ERRORLEVEL% equ 0 (
    echo [ALAMS USB INSTALL] Stopping AlamsDaemon service...
    net stop AlamsDaemon >nul 2>nul
)

REM Kill running client process
echo [ALAMS USB INSTALL] Terminating active client screen lock process...
taskkill /f /im AlamsClient.exe >nul 2>nul

REM Ensure target folder exists
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"

REM Copy files from USB
echo [ALAMS USB INSTALL] Copying binaries to %INSTALL_DIR%...
copy /y "%~dp0AlamsClient.exe" "%INSTALL_DIR%\"
copy /y "%~dp0AlamsDaemon.exe" "%INSTALL_DIR%\"

REM Restart Watchdog service
sc query AlamsDaemon >nul 2>nul
if %ERRORLEVEL% equ 0 (
    echo [ALAMS USB INSTALL] Starting AlamsDaemon service...
    net start AlamsDaemon >nul 2>nul
)

REM Start client lock screen shell
echo [ALAMS USB INSTALL] Launching AlamsClient lock screen shell...
start "" "%INSTALL_DIR%\AlamsClient.exe"

echo [SUCCESS] Client successfully updated from USB!
pause
exit /b 0
