Option Explicit

Dim shell
Dim fso
Dim scriptDir
Dim usbRoot
Dim launcher
Dim command

Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
usbRoot = fso.GetParentFolderName(fso.GetParentFolderName(scriptDir))
launcher = fso.BuildPath(usbRoot, "launcher\windows\ClawHermes-Control-Launch.ps1")
command = "powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File " & Quote(launcher) & " -UsbRoot " & Quote(usbRoot)

shell.Run command, 0, False

Function Quote(value)
    Quote = """" & Replace(value, """", """""") & """"
End Function
