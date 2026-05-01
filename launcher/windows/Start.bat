@echo off
setlocal
set SCRIPT_DIR=%~dp0
for %%I in ("%SCRIPT_DIR%..\..") do set USB_ROOT=%%~fI
powershell -NoProfile -ExecutionPolicy Bypass -File "%USB_ROOT%\core\windows\clawhermes.ps1" start -UsbRoot "%USB_ROOT%"
set CLAWHERMES_EXIT=%ERRORLEVEL%
set CLAWHERMES_PORTAL_URL=http://127.0.0.1:17000/
if "%CLAWHERMES_EXIT%"=="0" for /f "usebackq delims=" %%U in (`powershell -NoProfile -Command "$p = Join-Path -Path '%USB_ROOT%' -ChildPath 'data\tmp\ports.json'; if (Test-Path -LiteralPath $p) { try { (Get-Content -LiteralPath $p -Raw | ConvertFrom-Json).portal.url } catch { 'http://127.0.0.1:17000/' } } else { 'http://127.0.0.1:17000/' }"`) do set CLAWHERMES_PORTAL_URL=%%U
if "%CLAWHERMES_EXIT%"=="0" start "" "%CLAWHERMES_PORTAL_URL%"
endlocal & exit /b %CLAWHERMES_EXIT%
