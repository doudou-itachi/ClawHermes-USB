@echo off
setlocal
set SCRIPT_DIR=%~dp0
for %%I in ("%SCRIPT_DIR%..\..") do set USB_ROOT=%%~fI
powershell -NoProfile -ExecutionPolicy Bypass -File "%USB_ROOT%\core\windows\clawhermes.ps1" start -UsbRoot "%USB_ROOT%"
set CLAWHERMES_EXIT=%ERRORLEVEL%
if "%CLAWHERMES_EXIT%"=="0" start "" "http://127.0.0.1:17000/"
endlocal & exit /b %CLAWHERMES_EXIT%
