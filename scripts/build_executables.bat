@echo off
REM =============================================================================
REM ALAMS - Compile and Publish Executables (Single-File EXEs)
REM =============================================================================
echo [ALAMS BUILD] Preparing output directories...

set WORKSPACE_DIR=%~dp0..
set PUBLISH_DIR=%WORKSPACE_DIR%\publish

if not exist "%PUBLISH_DIR%" mkdir "%PUBLISH_DIR%"
if not exist "%PUBLISH_DIR%\client" mkdir "%PUBLISH_DIR%\client"
if not exist "%PUBLISH_DIR%\server-gui" mkdir "%PUBLISH_DIR%\server-gui"

echo =============================================================================
echo [ALAMS BUILD] 1/2: Publishing WPF Client Workstation Screen Lock...
echo =============================================================================
cd /d "%WORKSPACE_DIR%\client"
call dotnet publish AlamsClient.csproj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -o "%PUBLISH_DIR%\client"

if %ERRORLEVEL% equ 0 (
    echo [SUCCESS] Client WPF published to: %PUBLISH_DIR%\client\AlamsClient.exe
) else (
    echo [ERROR] Client compilation failed!
)

echo.
echo =============================================================================
echo [ALAMS BUILD] 2/3: Publishing WPF Client Daemon/Watchdog...
echo =============================================================================
cd /d "%WORKSPACE_DIR%\watchdog"
call dotnet publish AlamsWatchdog.csproj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -o "%PUBLISH_DIR%\client"

if %ERRORLEVEL% equ 0 (
    echo [SUCCESS] Client Daemon published to: %PUBLISH_DIR%\client\AlamsDaemon.exe
) else (
    echo [ERROR] Client Daemon compilation failed!
)

echo.
echo =============================================================================
echo [ALAMS BUILD] 3/3: Publishing WPF Server GUI console Dashboard...
echo =============================================================================
cd /d "%WORKSPACE_DIR%\server-gui"
call dotnet publish AlamsServerConsole.csproj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -o "%PUBLISH_DIR%\server-gui"


if %ERRORLEVEL% equ 0 (
    echo [SUCCESS] Server GUI Console published to: %PUBLISH_DIR%\server-gui\AlamsServerConsole.exe
) else (
    echo [ERROR] Server GUI compilation failed!
)

echo.
echo [OK] All compilations completed. You can copy the contents of the "%PUBLISH_DIR%" folder to your USB drive.
pause
exit /b 0
