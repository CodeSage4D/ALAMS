@echo off
setlocal enabledelayedexpansion
REM =============================================================================
REM ALAMS - Server PC Startup & Environment Configuration Tool
REM =============================================================================
echo ===================================================================
echo        ALAMS SERVER AUTO-STARTUP SETUP ^& DIAGNOSTICS WIZARD       
echo ===================================================================
echo.

:: Check Administrator privileges
net session >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] This script must be run as an Administrator!
    echo Please right-click CMD and select "Run as Administrator".
    pause
    exit /b 1
)

set REPO_DIR=%~dp0
cd /d "%REPO_DIR%"

echo [1/4] Ensuring Windows Explorer Shell registry settings...
:: Ensure user Shell is set to explorer.exe
reg add "HKCU\Software\Microsoft\Windows NT\CurrentVersion\Winlogon" /v "Shell" /t REG_SZ /d "explorer.exe" /f >nul
:: Ensure system Shell is set to explorer.exe
reg add "HKLM\Software\Microsoft\Windows NT\CurrentVersion\Winlogon" /v "Shell" /t REG_SZ /d "explorer.exe" /f >nul
echo [PASS] Explorer shell registry settings verified.

:: Ensure explorer.exe is active
tasklist /nh /fi "imagename eq explorer.exe" | find /i "explorer.exe" >nul
if %ERRORLEVEL% neq 0 (
    echo [INFO] explorer.exe is not running. Starting explorer.exe...
    start explorer.exe
) else (
    echo [OK] explorer.exe is currently active.
)

echo.
echo [2/4] Compiling and Publishing Server WPF console GUI...
cd /d "%REPO_DIR%server-gui"
call dotnet publish AlamsServerConsole.csproj -c Release -r win-x64 --self-contained false -o publish
if %ERRORLEVEL% neq 0 (
    echo [ERROR] WPF Server GUI compilation failed!
    pause
    exit /b 1
)
echo [PASS] WPF Server GUI compiled successfully.

echo.
echo [3/4] Registering auto-startup programs in Registry...
:: Add backend serverstart.bat to HKCU Run key
reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v "ALAMS_Backend_Server" /t REG_SZ /d "\"%REPO_DIR%serverstart.bat\"" /f >nul
:: Add AlamsServerConsole.exe to HKCU Run key
reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v "ALAMS_Server_GUI" /t REG_SZ /d "\"%REPO_DIR%server-gui\publish\AlamsServerConsole.exe\"" /f >nul
echo [PASS] Startup Registry keys configured successfully.

echo.
echo [4/4] Creating backup shortcuts in User Startup folder for redundancy...
set STARTUP_DIR=%USERPROFILE%\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup

:: Write a simple VBScript helper to generate absolute shortcuts
set VBS_SCRIPT=%TEMP%\CreateShortcut.vbs
echo Set oWS = WScript.CreateObject("WScript.Shell") > "%VBS_SCRIPT%"
echo sLinkFile = WScript.Arguments(0) >> "%VBS_SCRIPT%"
echo Set oLink = oWS.CreateShortcut(sLinkFile) >> "%VBS_SCRIPT%"
echo oLink.TargetPath = WScript.Arguments(1) >> "%VBS_SCRIPT%"
echo oLink.WorkingDirectory = WScript.Arguments(2) >> "%VBS_SCRIPT%"
echo oLink.Save >> "%VBS_SCRIPT%"

:: Create shortcut to serverstart.bat
cscript //nologo "%VBS_SCRIPT%" "%STARTUP_DIR%\ALAMS_Backend_Server.lnk" "%REPO_DIR%serverstart.bat" "%REPO_DIR%"
:: Create shortcut to AlamsServerConsole.exe
cscript //nologo "%VBS_SCRIPT%" "%STARTUP_DIR%\ALAMS_Server_GUI.lnk" "%REPO_DIR%server-gui\publish\AlamsServerConsole.exe" "%REPO_DIR%server-gui\publish"

del "%VBS_SCRIPT%" 2>nul
echo [PASS] User startup shortcuts generated.

echo.
echo ===================================================================
echo    SUCCESS! ALAMS AUTO-STARTUP REGISTRY ^& SHORTCUTS CONFIGURED!   
echo ===================================================================
echo The server database api and console GUI will launch automatically 
echo when this Windows Server PC turns on and the Administrator logs in.
echo ===================================================================
pause
