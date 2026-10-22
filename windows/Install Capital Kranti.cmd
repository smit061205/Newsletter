@echo off
rem Capital Kranti setup: double-click this file. It installs the app for this Windows user.
set "LOCAL=%~dp0install.ps1"
if exist "%LOCAL%" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%LOCAL%"
) else (
  powershell -NoProfile -ExecutionPolicy Bypass -Command "$f=Join-Path $env:TEMP ck-install.ps1; Invoke-WebRequest https://raw.githubusercontent.com/smit061205/Newsletter/main/windows/install.ps1 -OutFile $f -UseBasicParsing; & $f"
)
echo.
pause
