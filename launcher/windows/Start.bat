@echo off
setlocal
set SCRIPT_DIR=%~dp0
for %%I in ("%SCRIPT_DIR%..\..") do set USB_ROOT=%%~fI

set HOME=%USB_ROOT%\data\home
set USERPROFILE=%USB_ROOT%\data\home
set APPDATA=%USB_ROOT%\data\home\AppData\Roaming
set LOCALAPPDATA=%USB_ROOT%\data\home\AppData\Local
set TEMP=%USB_ROOT%\data\tmp
set TMP=%USB_ROOT%\data\tmp
set HERMES_HOME=%USB_ROOT%\data\hermes
set npm_config_cache=%USB_ROOT%\data\cache\npm
set PIP_CACHE_DIR=%USB_ROOT%\data\cache\pip
set UV_CACHE_DIR=%USB_ROOT%\data\cache\uv

echo ClawHermes-USB start placeholder.
echo USB_ROOT=%USB_ROOT%
echo HERMES_HOME=%HERMES_HOME%
echo Portal target: http://127.0.0.1:17000/
echo.
echo Real service orchestration will be implemented in a later milestone.
endlocal
