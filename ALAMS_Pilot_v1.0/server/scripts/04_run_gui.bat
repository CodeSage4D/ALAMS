@echo off
echo ==============================================
echo [ALAMS SERVER] Launching Command Center GUI...
echo ==============================================
cd /d "%~dp0..\..\server-gui\publish"
if not exist "AlamsServerConsole.exe" (
    echo [WARNING] GUI not compiled in publish yet. Running build...
    cd /d "%~dp0..\.."
    call configure_server_startup.bat
)
cd /d "%~dp0..\..\server-gui\publish"
start AlamsServerConsole.exe
