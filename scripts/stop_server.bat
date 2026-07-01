@echo off
REM =============================================================================
REM ALAMS - Server Stop Script
REM =============================================================================
echo [ALAMS SERVER] Terminating ALAMS server on port 5000...

for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5000" ^| findstr "LISTENING"') do (
    echo [ALAMS SERVER] Found process ID %%a listening on port 5000. Killing process...
    taskkill /f /pid %%a
    goto done
)

echo [ALAMS SERVER] No active server detected listening on port 5000.

:done
echo [OK] ALAMS Server stop command completed.
exit /b 0
