@echo off
REM =============================================================================
REM ALAMS - Database Backup Script
REM =============================================================================
echo [ALAMS DATABASE] Initiating database backup...

cd /d "%~dp0\..\server"

if not exist ".env" (
    echo [ERROR] .env file not found in server directory. Cannot retrieve database configuration.
    exit /b 1
)

REM Load environment variables from .env
for /f "usebackq tokens=1,2 delims==" %%i in (".env") do (
    if "%%i"=="DIRECT_URL" set DB_URL=%%j
    if "%%i"=="DATABASE_URL" if not defined DB_URL set DB_URL=%%j
)

REM Strip quotes if present
if defined DB_URL (
    set DB_URL=%DB_URL:"=%
)

if not defined DB_URL (
    echo [ERROR] DATABASE_URL or DIRECT_URL not found in .env file.
    exit /b 1
)

REM Get timestamp for filename
for /f "tokens=2 delims==" %%i in ('wmic os get localdatetime /value') do set datetime=%%i
set filename=alams_backup_%datetime:~0,8%_%datetime:~8,6%.sql
set filepath=..\backups\%filename%

echo [ALAMS DATABASE] Backing up to: %filepath%

REM Check if pg_dump is available in path
where pg_dump >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [WARN] pg_dump utility not found in system path.
    echo        If PostgreSQL client tools are not installed, please install them
    echo        or use pg_dump manually with the connection URL:
    echo        %DB_URL%
    exit /b 1
)

pg_dump "%DB_URL%" -F c -f "%filepath%"
if %ERRORLEVEL% neq 0 (
    echo [ERROR] pg_dump failed to export database.
    exit /b 1
)

echo [OK] Database backup completed: %filename%
exit /b 0
