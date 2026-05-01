@echo off
setlocal
set SCRIPT_DIR=%~dp0
for %%I in ("%SCRIPT_DIR%..\..") do set USB_ROOT=%%~fI
wscript.exe //B //Nologo "%USB_ROOT%\launcher\windows\ClawHermes-Control.vbs"
endlocal & exit /b 0
