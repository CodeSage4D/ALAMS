@echo off
REM =============================================================================
REM ALAMS - Workstation Client Update Bootstrapper
REM =============================================================================
echo [ALAMS UPDATE] Escalating privileges to execute PowerShell updater...

net session >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] This updater must be executed as an ADMINISTRATOR.
    pause
    exit /b 1
)

Powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0update_client.ps1"
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Update process encountered errors.
    pause
    exit /b 1
)

pause
exit /b 0
