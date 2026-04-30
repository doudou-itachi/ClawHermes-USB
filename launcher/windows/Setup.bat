@echo off
setlocal
set SCRIPT_DIR=%~dp0
for %%I in ("%SCRIPT_DIR%..\..") do set USB_ROOT=%%~fI
powershell -NoProfile -ExecutionPolicy Bypass -File "%USB_ROOT%\core\windows\clawhermes.ps1" setup -UsbRoot "%USB_ROOT%"
endlocal
