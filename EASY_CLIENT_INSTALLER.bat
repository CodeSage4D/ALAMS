@echo off
title ALAMS Client Installer (One-Click)

:: Auto-elevate to Administrator (UAC Prompt)
net session >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo Requesting administrative privileges...
    powershell -Command "Start-Process -FilePath '%0' -ArgumentList 'Elevated' -Verb RunAs"
    exit /b
)

echo ===================================================================
echo             ALAMS WORKSTATION CLIENT ONE-CLICK INSTALLER
echo ===================================================================
echo.
echo  Target Server IP : http://192.168.128.73:5000
echo  Target Workstation User: Student
echo.
echo  Installing binaries, configuring settings, and locking shell...
echo  Please wait...
echo.

:: Execute the central installer script with preset fixed Server IP and Student user arguments
call "%~dp0scripts\install_client.bat" "http://192.168.128.73:5000" "Student"

echo.
echo ===================================================================
echo                    INSTALLATION SUCCESSFUL!
echo ===================================================================
echo.
echo  The ALAMS Lock Screen has been registered for the 'Student' account.
echo  Please log out and log back in as 'Student' to run the Lock Screen.
echo.
pause
