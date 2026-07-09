@echo off
REM =============================================================================
REM ALAMS - Workstation Client Uninstaller
REM =============================================================================
echo [ALAMS CLIENT UNINSTALL] Reverting workstation to normal state...

net session >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] This uninstaller must be executed as an ADMINISTRATOR.
    exit /b 1
)

set INSTALL_DIR=C:\Program Files\ALAMS
set CONFIG_DIR=C:\ProgramData\ALAMS

REM Stop and delete AlamsDaemon service
sc query AlamsDaemon >nul 2>nul
if %ERRORLEVEL% equ 0 (
    echo [ALAMS CLIENT UNINSTALL] Stopping and deleting AlamsDaemon service...
    net stop AlamsDaemon >nul 2>nul
    sc delete AlamsDaemon >nul 2>nul
    echo [OK] Daemon service removed.
)

REM Restore Windows shell
echo [ALAMS CLIENT UNINSTALL] Restoring default Windows Explorer shell...
powershell -Command "Remove-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows NT\CurrentVersion\Winlogon' -Name 'Shell' -ErrorAction SilentlyContinue; Write-Host '      ✔ HKCU Shell override removed.' -ForegroundColor Green"

REM Delete installation directories
echo [ALAMS CLIENT UNINSTALL] Purging folders...
if exist "%INSTALL_DIR%" (
    rmdir /s /q "%INSTALL_DIR%"
    echo [OK] Deleted %INSTALL_DIR%
)
if exist "%CONFIG_DIR%" (
    rmdir /s /q "%CONFIG_DIR%"
    echo [OK] Deleted %CONFIG_DIR%
)

echo [OK] Workstation uninstall complete. Windows Explorer shell restored.
exit /b 0
