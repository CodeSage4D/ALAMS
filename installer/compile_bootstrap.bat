@echo off
echo ============================================================
echo   ALAMS Bootstrap Wizard Compiler
echo ============================================================
echo.

REM Check for dotnet SDK
where dotnet >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] .NET SDK is not installed or not in PATH.
    echo Please install .NET 8 SDK: winget install Microsoft.DotNet.SDK.8
    echo.
    pause
    exit /b 1
)

echo Compiling AlamsBootstrap as self-contained single file...
cd "%~dp0\bootstrap"
dotnet publish AlamsBootstrap.csproj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -o "%~dp0"
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Compilation failed.
    pause
    exit /b 1
)

echo Renaming executable to bootstrap_installer.exe...
if exist "%~dp0\AlamsBootstrap.exe" (
    move /y "%~dp0\AlamsBootstrap.exe" "%~dp0\bootstrap_installer.exe" >nul
)

echo.
echo ============================================================
echo   SUCCESS! Compiled file: installer\bootstrap_installer.exe
echo ============================================================
echo.
pause
