@echo off
setlocal enabledelayedexpansion
REM =============================================================================
REM ALAMS - All-in-One Installer, Builder & Packager
REM =============================================================================
echo =============================================================================
echo [ALAMS SETUP & BUILD WIZARD] Starting deployment environment setup...
echo =============================================================================

:: Check Administrator privileges
net session >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] This script must be run as an Administrator!
    echo Please right-click CMD or PowerShell and select "Run as Administrator".
    pause
    exit /b 1
)

set /p BUILD_CLIENT="Do you want to build and package Client Workstation binaries (WPF/Watchdog)? (y/n, default is y): "
if /i "%BUILD_CLIENT%"=="n" (
    set BUILD_CLIENT_FLAG=0
    echo [INFO] Skipping Client WPF and Watchdog builds.
) else (
    set BUILD_CLIENT_FLAG=1
)

if %BUILD_CLIENT_FLAG%==1 (
    REM Check .NET 8 SDK
    dotnet --list-sdks 2>nul | findstr /R "^8\." >nul
    if %ERRORLEVEL% neq 0 (
        echo [INFO] .NET 8 SDK not detected. Installing via winget...
        winget install --id Microsoft.DotNet.SDK.8 -e --accept-source-agreements --accept-package-agreements
        if !ERRORLEVEL! neq 0 (
            echo [ERROR] Failed to install .NET 8 SDK via winget. Please install it manually.
            pause
            exit /b 1
        )
        set RESTART_REQUIRED=1
    ) else (
        echo [OK] .NET 8 SDK is installed.
    )
)

:: Check Node.js
node -v >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [INFO] Node.js not detected. Installing LTS version via winget...
    winget install --id OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements
    if !ERRORLEVEL! neq 0 (
        echo [ERROR] Failed to install Node.js via winget. Please install it manually.
        pause
        exit /b 1
    )
    set RESTART_REQUIRED=1
) else (
    echo [OK] Node.js is installed.
)

:: Check Git
git --version >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [INFO] Git not detected. Installing via winget...
    winget install --id Git.Git -e --accept-source-agreements --accept-package-agreements
    if !ERRORLEVEL! neq 0 (
        echo [ERROR] Failed to install Git via winget. Please install it manually.
        pause
        exit /b 1
    )
    set RESTART_REQUIRED=1
) else (
    echo [OK] Git is installed.
)

if %RESTART_REQUIRED% neq 0 (
    echo =============================================================================
    echo [IMPORTANT] New software dependencies have been installed!
    echo To apply the environment variables, please close this terminal window,
    echo open a new Administrator terminal, and run this script again.
    echo =============================================================================
    pause
    exit /b 0
)

echo =============================================================================
echo [ALAMS SETUP] Software dependencies verified. Installing Node global tools...
echo =============================================================================

call npm install -g pm2
if %ERRORLEVEL% neq 0 (
    echo [WARNING] Failed to install pm2 globally. You might need to install it manually.
)

if %BUILD_CLIENT_FLAG%==1 (
    echo =============================================================================
    echo [ALAMS SETUP] Compiling C# Client & Watchdog executables...
    echo =============================================================================

    echo [BUILD] Publishing WPF Client...
    cd /d "%~dp0client"
    call dotnet publish AlamsClient.csproj -c Release
    if !ERRORLEVEL! neq 0 (
        echo [ERROR] WPF Client build failed!
        pause
        exit /b 1
    )

    echo [BUILD] Publishing Watchdog Service...
    cd /d "%~dp0watchdog"
    call dotnet publish AlamsWatchdog.csproj -c Release
    if !ERRORLEVEL! neq 0 (
        echo [ERROR] Watchdog Service build failed!
        pause
        exit /b 1
    )
)

echo =============================================================================
echo [ALAMS SETUP] Initializing Server Database & Building Backend...
echo =============================================================================

cd /d "%~dp0server"
if not exist ".env" (
    echo [INFO] .env file not found in server directory. Copying template...
    copy "..\config\.env.example" ".env"
    echo [IMPORTANT] Please make sure to configure server/.env with database credentials!
)

call npm install
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Server npm install failed!
    pause
    exit /b 1
)

call npx prisma generate
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Prisma client generation failed!
    pause
    exit /b 1
)

echo [BUILD] Compiling server TypeScript...
call npm run build
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Server build failed!
    pause
    exit /b 1
)

echo =============================================================================
echo [ALAMS SETUP] Setting up Web Dashboard...
echo =============================================================================

cd /d "%~dp0web"
call npm install
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Web console npm install failed!
    pause
    exit /b 1
)

echo [BUILD] Building Next.js Web Console...
call npm run build
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Web console Next.js build failed!
    pause
    exit /b 1
)

echo =============================================================================
echo [ALAMS SETUP] Assembling Pilot Release Package...
echo =============================================================================

cd /d "%~dp0scripts"
call package_pilot.bat
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Package assembly failed!
    pause
    exit /b 1
)

echo =============================================================================
echo [SUCCESS] Everything setup, built, and packaged successfully!
echo The output folder 'ALAMS_Pilot_v1.0' has been created at:
echo %~dp0ALAMS_Pilot_v1.0
echo =============================================================================
pause
