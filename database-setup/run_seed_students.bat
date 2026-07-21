@echo off
setlocal EnableDelayedExpansion
title ALAMS - Run Student SQL Seed (Offline DB)
color 0B
cls

echo.
echo  =====================================================================
echo   ALAMS - Run Student Offline SQL Seed File
echo   Aurxon Lab Access Management System
echo  =====================================================================
echo.

set "SCRIPT_DIR=%~dp0"
set "SQL_FILE=%SCRIPT_DIR%seed_students.sql"

if not exist "%SQL_FILE%" (
    echo  ERROR: SQL seed file not found at: %SQL_FILE%
    echo  Please run Student-Data\run_import.bat first to generate the seed file.
    echo.
    pause
    exit /b 1
)

echo  Found seed file: %SQL_FILE%
echo  Importing student records into local PostgreSQL database (alams)...
echo.

set "PG_BIN=C:\Program Files\PostgreSQL\16\bin\psql.exe"
if not exist "%PG_BIN%" set "PG_BIN=C:\Program Files\PostgreSQL\15\bin\psql.exe"
if not exist "%PG_BIN%" set "PG_BIN=psql"

"%PG_BIN%" -U postgres -d alams -f "%SQL_FILE%"
if %errorlevel% equ 0 (
    echo.
    echo  =====================================================================
    echo   SUCCESS! All student records imported into local PostgreSQL database.
    echo  =====================================================================
    echo.
) else (
    echo.
    echo  WARNING: psql returned exit code %errorlevel%. Check PostgreSQL credentials.
    echo.
)

pause
endlocal
