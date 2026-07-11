@echo off
REM =============================================================================
REM ALAMS - Pilot Package Generator
REM =============================================================================
echo [ALAMS PACKAGER] Initiating ALAMS_Pilot_v1.0 release assembly...

set PKG_DIR=%~dp0\..\ALAMS_Pilot_v1.0

if exist "%PKG_DIR%" (
    echo [ALAMS PACKAGER] Cleaning existing package folder...
    rmdir /s /q "%PKG_DIR%"
)

mkdir "%PKG_DIR%"
mkdir "%PKG_DIR%\server"
mkdir "%PKG_DIR%\client"
mkdir "%PKG_DIR%\pilot"
mkdir "%PKG_DIR%\documentation"

echo [ALAMS PACKAGER] Copying server deployment files...
xcopy /e /y /q "%~dp0\..\server\dist" "%PKG_DIR%\server\dist\"
xcopy /y "%~dp0\..\server\package.json" "%PKG_DIR%\server\"
xcopy /e /y /q "%~dp0\..\server\prisma" "%PKG_DIR%\server\prisma\"
if exist "%~dp0\..\server\.env" (
    xcopy /y "%~dp0\..\server\.env" "%PKG_DIR%\server\"
)

echo [ALAMS PACKAGER] Copying web dashboard build files...
if exist "%~dp0\..\web\.next" (
    mkdir "%PKG_DIR%\web"
    xcopy /e /y /q "%~dp0\..\web\.next" "%PKG_DIR%\web\.next\"
    xcopy /y "%~dp0\..\web\package.json" "%PKG_DIR%\web\"
)

echo [ALAMS PACKAGER] Copying client deployment binaries and scripts...
REM Copy client helper batch scripts
xcopy /y "%~dp0\install_client.bat" "%PKG_DIR%\client\"
xcopy /y "%~dp0\uninstall_client.bat" "%PKG_DIR%\client\"
xcopy /y "%~dp0\update_client.bat" "%PKG_DIR%\client\"
xcopy /y "%~dp0\watchdog.service" "%PKG_DIR%\client\"
xcopy /y "%~dp0\ControlCenter.ps1" "%PKG_DIR%\client\"
xcopy /y "%~dp0\..\EnrollShell.ps1" "%PKG_DIR%\client\"

REM Copy client configs
mkdir "%PKG_DIR%\client\config"
xcopy /y "%~dp0\..\config\default_settings.json" "%PKG_DIR%\client\config\"
xcopy /y "%~dp0\..\config\pilot.config.json" "%PKG_DIR%\client\config\"
xcopy /y "%~dp0\..\config\config.schema.json" "%PKG_DIR%\client\config\"
xcopy /y "%~dp0\..\config\version.json" "%PKG_DIR%\client\config\"

REM Copy client compiled executables if available
if exist "%~dp0\..\client\bin\Release\net8.0-windows\publish\AlamsClient.exe" (
    xcopy /y "%~dp0\..\client\bin\Release\net8.0-windows\publish\AlamsClient.exe" "%PKG_DIR%\client\"
)
if exist "%~dp0\..\watchdog\bin\Release\net8.0\publish\AlamsDaemon.exe" (
    xcopy /y "%~dp0\..\watchdog\bin\Release\net8.0\publish\AlamsDaemon.exe" "%PKG_DIR%\client\"
)
if exist "%~dp0\..\scripts\EnrollWorkstation.ps1" (
    xcopy /y "%~dp0\..\scripts\EnrollWorkstation.ps1" "%PKG_DIR%\client\"
)

REM Copy installer configuration files
mkdir "%PKG_DIR%\client\installer"
xcopy /y "%~dp0\..\installer\product.wxs" "%PKG_DIR%\client\installer\"
xcopy /y "%~dp0\..\installer\silent_install.ini" "%PKG_DIR%\client\installer\"

echo [ALAMS PACKAGER] Copying pilot testing data and checklists...
xcopy /y "%~dp0\..\credential.txt" "%PKG_DIR%\pilot\"
xcopy /y "%~dp0\..\tests\smoke_test.ps1" "%PKG_DIR%\pilot\"
xcopy /y "%~dp0\..\tests\checklists.md" "%PKG_DIR%\pilot\"
xcopy /y "%~dp0\..\tests\api_test_collection.json" "%PKG_DIR%\pilot\"

echo [ALAMS PACKAGER] Copying documentation manuals...
xcopy /y "%~dp0\..\docs\markdown\*.md" "%PKG_DIR%\documentation\"

echo =============================================================================
echo [OK] ALAMS_Pilot_v1.0 package generated successfully at:
echo      %PKG_DIR%
echo =============================================================================
exit /b 0
