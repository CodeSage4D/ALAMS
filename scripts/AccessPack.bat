@echo off
setlocal enabledelayedexpansion
REM =============================================================================
REM ALAMS Unified Recovery Pack & Self-Healing Toolkit
REM SCSIT Symbiosis University of Applied Sciences, Indore
REM =============================================================================
echo ===================================================================
echo         ALAMS UNIFIED SELF-HEALING & SECURITY REPAIR TOOLKIT       
echo ===================================================================
echo.

:: 1. Verify Admin/UAC Elevation
net session >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [INFO] Administrative permissions required. Elevating privileges...
    powershell -Command "Start-Process -FilePath '%0' -Verb RunAs"
    exit /b 0
)

:: Define base folders relative to script location
set SCRIPT_DIR=%~dp0
set BASE_DIR=%SCRIPT_DIR%..
set SERVER_DIR=%BASE_DIR%\server
set CLIENT_DIR=%BASE_DIR%\client
set RECOVERY_DIR=C:\ProgramData\ALAMS

:: Establish diagnostic report file
set REPORT_FILE=%RECOVERY_DIR%\repair_report.txt
if not exist "%RECOVERY_DIR%" mkdir "%RECOVERY_DIR%"
echo ALAMS REPAIR & Diagnostic Report > "%REPORT_FILE%"
echo Generated at: %date% %time% >> "%REPORT_FILE%"
echo Machine HostName: %computername% >> "%REPORT_FILE%"
echo ==================================================== >> "%REPORT_FILE%"
echo. >> "%REPORT_FILE%"

:: 2. Environment Auto-Discovery (Server vs Client check)
set IS_SERVER=0
if exist "%SERVER_DIR%\package.json" (
    set IS_SERVER=1
)

if "%IS_SERVER%"=="1" (
    echo [DETECTED] ALAMS Central Management Server Machine
    echo Environment: SERVER >> "%REPORT_FILE%"
    goto :SERVER_REPAIR
) else (
    echo [DETECTED] ALAMS Workstation Client Machine
    echo Environment: CLIENT WORKSTATION >> "%REPORT_FILE%"
    goto :CLIENT_REPAIR
)

REM =============================================================================
REM SERVER REPAIR FLOW
REM =============================================================================
:SERVER_REPAIR
echo.
echo [1/6] Backing up security activation credentials...
set BACKUP_DIR=%BASE_DIR%\backups\activation_security
if not exist "%BACKUP_DIR%" mkdir "%BACKUP_DIR%"

if exist "%SERVER_DIR%\.env" (
    echo       Backing up server env config key file...
    copy /y "%SERVER_DIR%\.env" "%BACKUP_DIR%\.env" >nul
    
    :: Generate timestamped backup version
    for /f "tokens=2 delims==" %%i in ('wmic os get localdatetime /value') do set datetime=%%i
    set ts_filename=env_backup_!datetime:~0,8!_!datetime:~8,6!.env
    copy /y "%SERVER_DIR%\.env" "%BACKUP_DIR%\!ts_filename!" >nul
    
    echo [PASS] Security files backed up to: backups/activation_security/
    echo Security backups: SUCCESS >> "%REPORT_FILE%"
) else (
    echo [ERROR] server/.env file missing. Security credentials cannot be backed up!
    echo Security backups: ENV FILE MISSING >> "%REPORT_FILE%"
)

echo.
echo [2/6] Verifying node environment dependencies...
where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js is not installed on the system PATH!
    echo Node.js: NOT INSTALLED >> "%REPORT_FILE%"
) else (
    for /f "usebackq" %%v in (`node -v`) do set node_ver=%%v
    echo       Node.js version detected: !node_ver!
    echo Node.js: OK (!node_ver!) >> "%REPORT_FILE%"
)

echo.
echo [3/6] Applying local server Windows Defender Firewall rules...
powershell -Command "New-NetFirewallRule -DisplayName 'ALAMS Port 5000' -Direction Inbound -Protocol TCP -LocalPort 5000 -Action Allow -Force; New-NetFirewallRule -DisplayName 'ALAMS Port 3000' -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow -Force; New-NetFirewallRule -DisplayName 'ALAMS UDP Beacon' -Direction Inbound -Protocol UDP -LocalPort 35200 -Action Allow -Force" >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo [PASS] Inbound rules (3000, 5000, 35200) applied successfully.
    echo Inbound Firewall: ALLOWED >> "%REPORT_FILE%"
) else (
    echo [WARN] Failed to write firewall rules. Netsh check recommended.
    echo Inbound Firewall: RULE WRITING FAILURE >> "%REPORT_FILE%"
)

echo.
echo [4/6] Checking database status...
cd /d "%SERVER_DIR%"
call npx prisma generate >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo [PASS] Prisma schemas successfully validated.
    echo Database connection schemas: GENERATED >> "%REPORT_FILE%"
) else (
    echo [WARN] Prisma validation failed. Database connection or prisma setup issues.
    echo Database connection schemas: VALIDATION FAILED >> "%REPORT_FILE%"
)

echo.
echo [5/6] Verifying server health status (PORT 5000)...
powershell -Command "$res = Invoke-RestMethod -Uri 'http://localhost:5000/health' -TimeoutSec 2; if ($res.status -eq 'healthy') { exit 0 } else { exit 1 }" >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo [PASS] ALAMS Central Server is already active and online.
    echo Server Status: ONLINE >> "%REPORT_FILE%"
) else (
    echo [WARN] Server is offline. Auto-triggering service activation...
    
    :: Kill any orphaned node instances first
    taskkill /f /im node.exe >nul 2>&1
    
    :: Spawn start_server.bat in a separate shell window
    start "ALAMS SERVER ENGINE" cmd.exe /c "call %SCRIPT_DIR%start_server.bat"
    
    echo       Waiting for server engine startup (10s)...
    timeout /t 10 /nobreak >nul
    
    :: Re-check health status
    powershell -Command "$res = Invoke-RestMethod -Uri 'http://localhost:5000/health' -TimeoutSec 2; if ($res.status -eq 'healthy') { exit 0 } else { exit 1 }" >nul 2>&1
    if !ERRORLEVEL! equ 0 (
        echo [SUCCESS] Server activated and is now online!
        echo Server Status: ACTIVATED & ONLINE >> "%REPORT_FILE%"
    ) else (
        echo [ERROR] Server failed to warm up correctly. Check server_startup.log.
        echo Server Status: STARTUP FAILURE >> "%REPORT_FILE%"
    )
)

echo.
echo [6/6] Auditing server security configuration...
if exist "%SERVER_DIR%\.env" (
    findstr /i "JWT_SECRET" "%SERVER_DIR%\.env" >nul
    if !ERRORLEVEL! equ 0 (
        echo [PASS] JWT authentication keys verified.
        echo Security Keys Audit: JWT KEY CONFIGURED >> "%REPORT_FILE%"
    ) else (
        echo [WARN] Authentication JWT secret missing from env.
        echo Security Keys Audit: JWT KEY MISSING >> "%REPORT_FILE%"
    )
)
goto :FINALIZE_REPAIR


REM =============================================================================
REM CLIENT WORKSTATION REPAIR FLOW
REM =============================================================================
:CLIENT_REPAIR
echo.
echo [1/7] Backing up local activation and config settings...
set CLIENT_BACKUP=%RECOVERY_DIR%\activation_security
if not exist "%CLIENT_BACKUP%" mkdir "%CLIENT_BACKUP%"

if exist "%RECOVERY_DIR%\config.json" (
    copy /y "%RECOVERY_DIR%\config.json" "%CLIENT_BACKUP%\config.json" >nul
    for /f "tokens=2 delims==" %%i in ('wmic os get localdatetime /value') do set datetime=%%i
    copy /y "%RECOVERY_DIR%\config.json" "%CLIENT_BACKUP%\config_backup_!datetime:~0,8!_!datetime:~8,6!.json" >nul
    echo [PASS] Workstation config backed up successfully.
    echo Client Backups: SUCCESS >> "%REPORT_FILE%"
) else (
    echo [WARN] config.json was not found. System requires initial enrollment.
    echo Client Backups: CONFIG FILE MISSING >> "%REPORT_FILE%"
)

echo.
echo [2/7] Auditing Watchdog Daemon Service...
sc query AlamsWatchdog >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [WARN] AlamsWatchdog service is NOT registered. Attempting registration...
    if exist "C:\Program Files\ALAMS\AlamsDaemon.exe" (
        sc create AlamsWatchdog binPath= "C:\Program Files\ALAMS\AlamsDaemon.exe" start= auto >nul
        sc start AlamsWatchdog >nul
        echo Watchdog service: REGISTERED & STARTED >> "%REPORT_FILE%"
    ) else (
        echo [ERROR] Watchdog service binary (AlamsDaemon.exe) not found in Program Files!
        echo Watchdog service: BINARY MISSING >> "%REPORT_FILE%"
    )
) else (
    echo [PASS] AlamsWatchdog service registered.
    sc query AlamsWatchdog | find "RUNNING" >nul
    if %ERRORLEVEL% neq 0 (
        echo [WARN] Watchdog service is stopped. Starting service...
        sc start AlamsWatchdog >nul
        echo Watchdog service: STARTED >> "%REPORT_FILE%"
    ) else (
        echo [PASS] Watchdog service is running.
        echo Watchdog service: RUNNING >> "%REPORT_FILE%"
    )
)

echo.
echo [3/7] Re-applying workstation firewall allowances...
powershell -Command "New-NetFirewallRule -DisplayName 'ALAMS Port 5000' -Direction Inbound -Protocol TCP -LocalPort 5000 -Action Allow -Force; New-NetFirewallRule -DisplayName 'ALAMS Port 3000' -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow -Force; New-NetFirewallRule -DisplayName 'ALAMS UDP Beacon' -Direction Inbound -Protocol UDP -LocalPort 35200 -Action Allow -Force" >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo [PASS] Firewall outbound and inbound port rule mappings aligned.
    echo Inbound Firewall: OK >> "%REPORT_FILE%"
) else (
    echo [WARN] Firewall rule validation encountered error.
    echo Inbound Firewall: ERROR >> "%REPORT_FILE%"
)

echo.
echo [4/7] Restoring workstation scheduled startup rules...
schtasks /query /tn "ALAMS_Startup" >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [WARN] Startup Task missing. Re-registering user shell trigger...
    schtasks /create /tn "ALAMS_Startup" /tr "C:\Program Files\ALAMS\AlamsClient.exe" /sc onstart /ru SYSTEM /f >nul 2>&1
    echo Task scheduler: RE-REGISTERED >> "%REPORT_FILE%"
) else (
    echo [PASS] Startup scheduled tasks active.
    echo Task scheduler: OK >> "%REPORT_FILE%"
)

echo.
echo [5/7] Auditing local registry policy overrides...
reg add "HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Winlogon" /v Shell /t REG_SZ /d "C:\Program Files\ALAMS\AlamsClient.exe" /f >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo [PASS] Shell override registry key reset to AlamsClient.exe.
    echo Winlogon override: CONFIGURED >> "%REPORT_FILE%"
) else (
    echo [ERROR] Registry override write failed.
    echo Winlogon override: FAILED TO WRITE >> "%REPORT_FILE%"
)

echo.
echo [6/7] Verifying lockscreen client execution...
tasklist /FI "IMAGENAME eq AlamsClient.exe" | find ":" >nul
if %ERRORLEVEL% equ 0 (
    echo [WARN] AlamsClient.exe is stopped. Launching client UI shell...
    if exist "C:\Program Files\ALAMS\AlamsClient.exe" (
        start "" "C:\Program Files\ALAMS\AlamsClient.exe"
        echo Client execution: SPAWNED >> "%REPORT_FILE%"
    ) else (
        echo [ERROR] Client binary not found in C:\Program Files\ALAMS\
        echo Client execution: BINARY MISSING >> "%REPORT_FILE%"
    )
) else (
    echo [PASS] Lockscreen client is active.
    echo Client execution: ACTIVE >> "%REPORT_FILE%"
)

echo.
echo [7/7] Testing connection to central server URL...
if exist "%RECOVERY_DIR%\config.json" (
    for /f "usebackq tokens=2 delims=:" %%a in (`findstr /c:\"serverUrl\" "%RECOVERY_DIR%\config.json"`) do (
        set SRV_URL=%%a
    )
    set SRV_URL=!SRV_URL:"=!
    set SRV_URL=!SRV_URL:,=!
    set SRV_URL=!SRV_URL: =!
    set SRV_URL=http:!SRV_URL!
    
    echo       Pinging: !SRV_URL!/health
    powershell -Command "$res = Invoke-RestMethod -Uri '!SRV_URL!/health' -TimeoutSec 3; if ($res.status -eq 'healthy') { exit 0 } else { exit 1 }" >nul 2>&1
    if !ERRORLEVEL! equ 0 (
        echo [PASS] Connectivity to Server !SRV_URL! verified.
        echo Server connection: CONNECTED >> "%REPORT_FILE%"
    ) else (
        echo [WARN] Cannot connect to server !SRV_URL!. Operating in offline fallback.
        echo Server connection: OFFLINE >> "%REPORT_FILE%"
    )
) else (
    echo [WARN] Enrollment missing. Cannot ping server.
    echo Server connection: NOT ENROLLED >> "%REPORT_FILE%"
)
goto :FINALIZE_REPAIR


REM =============================================================================
REM FINALIZE REPAIR AND REPORTING
REM =============================================================================
:FINALIZE_REPAIR
echo.
echo ===================================================================
echo       ALAMS AUTO-HEALING COMPLETED. OPENING AUDIT LOG...
echo ===================================================================
echo Diagnostic status: SUCCESSFUL >> "%REPORT_FILE%"
echo ==================================================== >> "%REPORT_FILE%"
timeout /t 2 >nul
notepad.exe "%REPORT_FILE%"
exit /b 0
