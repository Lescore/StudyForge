@echo off
chcp 65001 >nul
title StudyForge
cd /d "%~dp0"

rem Portable Node-Version aus setup.cmd (runtime\node) bevorzugen
if exist "%~dp0runtime\node\node.exe" set "PATH=%~dp0runtime\node;%PATH%"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js wurde nicht gefunden.
  echo StudyForge benoetigt Node.js 22.5 oder neuer ^(LTS-Version von https://nodejs.org/^).
  echo Eine Installation als Administrator ist nicht noetig; eine portable Node-Version genuegt.
  echo Am einfachsten: setup.cmd doppelklicken - es laedt bei Bedarf eine portable Version.
  echo.
  pause
  exit /b 1
)

node -e "const v=process.versions.node.split('.').map(Number);process.exit(v[0]>22||(v[0]===22&&v[1]>=5)?0:1)" >nul 2>nul
if errorlevel 1 (
  echo.
  for /f "delims=" %%v in ('node -v') do echo Gefundene Node.js-Version %%v ist zu alt.
  echo StudyForge benoetigt Node.js 22.5 oder neuer.
  echo Am einfachsten: setup.cmd doppelklicken - es laedt bei Bedarf eine portable Version.
  echo.
  pause
  exit /b 1
)

node --disable-warning=ExperimentalWarning scripts\start.js %*
echo.
echo StudyForge wurde beendet. Fenster kann geschlossen werden.
pause
