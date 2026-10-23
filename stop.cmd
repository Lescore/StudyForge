@echo off
chcp 65001 >nul
title StudyForge beenden
cd /d "%~dp0"

rem Portable Node-Version aus setup.cmd (runtime\node) bevorzugen
if exist "%~dp0runtime\node\node.exe" set "PATH=%~dp0runtime\node;%PATH%"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js wurde nicht gefunden.
  echo StudyForge kann auch durch Schliessen des Startfensters beendet werden.
  echo.
  pause
  exit /b 1
)

node --disable-warning=ExperimentalWarning scripts\stop.js %*
echo.
pause
