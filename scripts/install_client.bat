@echo off
REM =============================================================================
REM ALAMS - Workstation Client Silent Deployer & Installer
REM =============================================================================
echo [ALAMS CLIENT INSTALL] Starting deployment on local computer...

REM Run check for administrator privileges
net session >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] This installer must be executed as an ADMINISTRATOR.
    pause
    exit /b 1
)

set INSTALL_DIR=C:\Program Files\ALAMS
set CONFIG_DIR=C:\ProgramData\ALAMS
set SERVER_URL=http://localhost:5000
if not "%~1"=="" set SERVER_URL=%~1

echo [ALAMS CLIENT INSTALL] Target server url set to: %SERVER_URL%

REM Create folders
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"
if not exist "%CONFIG_DIR%" mkdir "%CONFIG_DIR%"

REM Generate configuration
echo [ALAMS CLIENT INSTALL] Provisioning config.json...
echo {> "%CONFIG_DIR%\config.json"
echo   "serverUrl": "%SERVER_URL%",>> "%CONFIG_DIR%\config.json"
echo   "computerId": "">> "%CONFIG_DIR%\config.json"
echo }>> "%CONFIG_DIR%\config.json"

REM Copy binaries
echo [ALAMS CLIENT INSTALL] Copying binaries to: %INSTALL_DIR%
if exist "%~dp0AlamsClient.exe" (
    copy /y "%~dp0AlamsClient.exe" "%INSTALL_DIR%\"
) else if exist "%~dp0\..\client\bin\Release\net8.0-windows\publish\AlamsClient.exe" (
    copy /y "%~dp0\..\client\bin\Release\net8.0-windows\publish\AlamsClient.exe" "%INSTALL_DIR%\"
) else if exist "%~dp0\..\client\bin\Debug\net8.0-windows\AlamsClient.exe" (
    copy /y "%~dp0\..\client\bin\Debug\net8.0-windows\AlamsClient.exe" "%INSTALL_DIR%\"
) else (
    echo [WARN] Compiled AlamsClient release build not found. Copied files must be configured manually.
)

if exist "%~dp0AlamsWatchdog.exe" (
    copy /y "%~dp0AlamsWatchdog.exe" "%INSTALL_DIR%\"
) else if exist "%~dp0\..\watchdog\bin\Release\net8.0\publish\AlamsWatchdog.exe" (
    copy /y "%~dp0\..\watchdog\bin\Release\net8.0\publish\AlamsWatchdog.exe" "%INSTALL_DIR%\"
) else if exist "%~dp0\..\watchdog\bin\Debug\net8.0\AlamsWatchdog.exe" (
    copy /y "%~dp0\..\watchdog\bin\Debug\net8.0\AlamsWatchdog.exe" "%INSTALL_DIR%\"
) else (
    echo [WARN] Compiled AlamsWatchdog release build not found. Copied files must be configured manually.
)

REM Install watchdog as Windows Service
echo [ALAMS CLIENT INSTALL] Installing AlamsWatchdog service...
sc query AlamsWatchdog >nul 2>nul
if %ERRORLEVEL% equ 0 (
    echo [ALAMS CLIENT INSTALL] Watchdog service already registered, stopping and deleting...
    net stop AlamsWatchdog >nul 2>nul
    sc delete AlamsWatchdog >nul 2>nul
)

if exist "%INSTALL_DIR%\AlamsWatchdog.exe" (
    sc create AlamsWatchdog binPath= "%INSTALL_DIR%\AlamsWatchdog.exe" start= auto
    sc description AlamsWatchdog "ALAMS Anti-bypass Security Watchdog Service"
    net start AlamsWatchdog
) else (
    echo [ERROR] AlamsWatchdog.exe is missing. Cannot register service.
)

REM Run shell enrollment script
if exist "%~dp0EnrollShell.ps1" (
    echo [ALAMS CLIENT INSTALL] Executing user shell enrollment...
    powershell -ExecutionPolicy Bypass -File "%~dp0EnrollShell.ps1" -AlamsClientPath "%INSTALL_DIR%\AlamsClient.exe"
) else if exist "%~dp0\..\EnrollShell.ps1" (
    echo [ALAMS CLIENT INSTALL] Executing user shell enrollment...
    powershell -ExecutionPolicy Bypass -File "%~dp0\..\EnrollShell.ps1" -AlamsClientPath "%INSTALL_DIR%\AlamsClient.exe"
) else (
    echo [WARN] EnrollShell.ps1 script not found. Shell must be set manually.
)

echo [OK] Client installation completed.
pause
exit /b 0
