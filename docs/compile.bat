@echo off
REM ============================================================
REM ALAMS Documentation Compiler
REM Aurxon Lab Access Management System
REM ============================================================
REM PREREQUISITES: MiKTeX or TeX Live installed and in PATH
REM MiKTeX Download: https://miktex.org/download
REM ============================================================

echo.
echo  ================================================
echo   ALAMS Documentation Build Starting...
echo  ================================================
echo.

SET TEXFILE=ALAMS_Pilot_User_Manual.tex
SET OUTPUT=ALAMS_Pilot_User_Manual

REM First pass — build structure and cross-references
echo [1/3] First LaTeX pass...
pdflatex -interaction=nonstopmode -jobname="%OUTPUT%" "%TEXFILE%"
IF ERRORLEVEL 1 GOTO ERROR

REM Second pass — resolve cross-references and TOC
echo [2/3] Second LaTeX pass (resolving references)...
pdflatex -interaction=nonstopmode -jobname="%OUTPUT%" "%TEXFILE%"
IF ERRORLEVEL 1 GOTO ERROR

REM Third pass — ensure all page numbers are correct
echo [3/3] Third LaTeX pass (final output)...
pdflatex -interaction=nonstopmode -jobname="%OUTPUT%" "%TEXFILE%"
IF ERRORLEVEL 1 GOTO ERROR

echo.
echo  ================================================
echo   SUCCESS! Output file: %OUTPUT%.pdf
echo  ================================================
echo.
echo  Open the manual:
echo    start %OUTPUT%.pdf
echo.

REM Clean up auxiliary files
echo Cleaning auxiliary files...
del /Q *.aux *.log *.toc *.lof *.lot *.out *.fls *.fdb_latexmk 2>NUL
for /r %%f in (chapters\*.aux appendix\*.aux) do del /Q "%%f" 2>NUL
echo Done.
echo.

start "" "%OUTPUT%.pdf"
GOTO END

:ERROR
echo.
echo  ================================================
echo   BUILD FAILED — Check the .log file for errors
echo  ================================================
echo.
echo  Common fixes:
echo    - Run: miktex --admin packages install tcolorbox pgfplots fontawesome5
echo    - Or:  mpm --install=tcolorbox --install=pgfplots --install=fontawesome5
echo.
pause

:END
