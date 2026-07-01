@echo off
REM =============================================================================
REM ALAMS - Workstation Client Update Script
REM =============================================================================
echo [ALAMS CLIENT UPDATE] Updating workstation client binaries...

net session >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] This updater must be executed as an ADMINISTRATOR.
    exit /b 1
)

set INSTALL_DIR=C:\Program Files\ALAMS

REM Stop watchdog service if running
sc query AlamsWatchdog >nul 2>nul
if %ERRORLEVEL% equ 0 (
    echo [ALAMS CLIENT UPDATE] Stopping AlamsWatchdog service...
    net stop AlamsWatchdog >nul 2>nul
)

REM Replace binaries
echo [ALAMS CLIENT UPDATE] Replacing client and watchdog binaries...
if exist "%~dp0\..\client\bin\Release\net8.0-windows\publish\AlamsClient.exe" (
    copy /y "%~dp0\..\client\bin\Release\net8.0-windows\publish\AlamsClient.exe" "%INSTALL_DIR%\"
)
if exist "%~dp0\..\watchdog\bin\Release\net8.0\publish\AlamsWatchdog.exe" (
    copy /y "%~dp0\..\watchdog\bin\Release\net8.0\publish\AlamsWatchdog.exe" "%INSTALL_DIR%\"
)

REM Restart service
sc query AlamsWatchdog >nul 2>nul
if %ERRORLEVEL% equ 0 (
    echo [ALAMS CLIENT UPDATE] Starting AlamsWatchdog service...
    net start AlamsWatchdog
)

echo [OK] Client binaries update check finished.
exit /b 0
