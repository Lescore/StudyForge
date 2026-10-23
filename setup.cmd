@echo off
chcp 65001 >nul
title StudyForge einrichten
cd /d "%~dp0"

rem StudyForge - Einrichtung fuer Windows 10/11
rem Prueft Node.js, laedt bei Bedarf (nach Rueckfrage) eine portable Version nach
rem runtime\node, legt optional eine Desktop-Verknuepfung an und prueft alles.
rem Keine Administratorrechte noetig. Optionen: -Yes  -NoShortcut  -Test

where powershell >nul 2>nul
if errorlevel 1 (
  echo.
  echo PowerShell wurde nicht gefunden. Bitte Node.js 22.5 oder neuer selbst installieren
  echo ^(LTS-Version von nodejs.org^) und danach start.cmd verwenden. Siehe ANLEITUNG.md.
  echo.
  pause
  exit /b 1
)

rem ExecutionPolicy Bypass gilt nur fuer diesen einen Aufruf, nichts wird dauerhaft umgestellt.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\setup-windows.ps1" %*
set "RESULT=%ERRORLEVEL%"
echo.
if not "%RESULT%"=="0" echo Die Einrichtung wurde nicht abgeschlossen ^(siehe Meldungen oben^).
pause
exit /b %RESULT%
