@echo off
setlocal
set SCRIPT_DIR=%~dp0
for %%I in ("%SCRIPT_DIR%..\..") do set USB_ROOT=%%~fI
powershell -NoProfile -ExecutionPolicy Bypass -File "%USB_ROOT%\launcher\windows\UserGuide.ps1" -Mode Stop -UsbRoot "%USB_ROOT%"
set CLAWHERMES_EXIT=%ERRORLEVEL%
endlocal & exit /b %CLAWHERMES_EXIT%
