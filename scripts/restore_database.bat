@echo off
REM =============================================================================
REM ALAMS - Database Restore Script
REM =============================================================================
echo [ALAMS DATABASE] Initiating database restore...

if "%~1"=="" (
    echo [USAGE] restore_database.bat [backup_filename.sql]
    echo         Please specify a backup file name located in the backups/ directory.
    exit /b 1
)

set backup_file=%~dp0\..\backups\%~1

if not exist "%backup_file%" (
    echo [ERROR] Backup file not found: %backup_file%
    exit /b 1
)

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
    echo [ERROR] DATABASE_URL or DIRECT_URL not found in .env.
    exit /b 1
)

REM Check if pg_restore is available in path
where pg_restore >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [WARN] pg_restore utility not found in system path.
    echo        If PostgreSQL client tools are not installed, please install them
    echo        or use pg_restore manually with the connection URL:
    echo        %DB_URL%
    exit /b 1
)

echo [ALAMS DATABASE] Restoring from: %backup_file%
pg_restore --clean --no-owner --no-acl -d "%DB_URL%" "%backup_file%"
if %ERRORLEVEL% neq 0 (
    echo [ERROR] pg_restore failed.
    exit /b 1
)

echo [OK] Database restore completed.
exit /b 0
