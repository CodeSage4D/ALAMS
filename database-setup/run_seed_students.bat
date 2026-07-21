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

if "%PGPASSWORD%"=="" set "PGPASSWORD=postgres"

echo  [1/3] Ensuring local PostgreSQL database "alams" exists...
"%PG_BIN%" -U postgres -c "CREATE DATABASE alams;" >nul 2>&1

echo  [2/3] Executing Prisma Database Schema Push...
set "SERVER_DIR=%SCRIPT_DIR%..\server"
if exist "%SERVER_DIR%" (
    cd /d "%SERVER_DIR%"
    set "DATABASE_URL=postgresql://postgres:postgres@localhost:5432/alams?sslmode=disable"
    set "DIRECT_URL=postgresql://postgres:postgres@localhost:5432/alams?sslmode=disable"
    call npx prisma generate >nul 2>&1
    call npx prisma db push --accept-data-loss >nul 2>&1
)

echo  [3/3] Executing Offline SQL Seed...
cd /d "%SCRIPT_DIR%"
"%PG_BIN%" -U postgres -d alams -f "%SQL_FILE%"
if %errorlevel% equ 0 (
    echo.
    echo  =====================================================================
    echo   SUCCESS! All student records imported into local PostgreSQL database.
    echo  =====================================================================
    echo.
) else (
    echo.
    echo  WARNING: psql returned exit code %errorlevel%. Check PostgreSQL service status.
    echo.
)

pause
endlocal

