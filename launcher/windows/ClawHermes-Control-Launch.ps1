param(
    [string]$UsbRoot
)

$ErrorActionPreference = "Stop"

function Resolve-ClawHermesRoot {
    param([string]$Root)
    if (-not [string]::IsNullOrWhiteSpace($Root)) {
        return (Resolve-Path -LiteralPath $Root).Path
    }
    return (Resolve-Path -LiteralPath (Join-Path -Path $PSScriptRoot -ChildPath "..\..")).Path
}

function ConvertTo-ProcessArgument {
    param([AllowNull()][string]$Argument)

    if ($null -eq $Argument) {
        return '""'
    }
    if ($Argument -notmatch '[\s"]') {
        return $Argument
    }

    $escaped = $Argument -replace '"', '\"'
    return '"' + $escaped + '"'
}

$root = Resolve-ClawHermesRoot -Root $UsbRoot
$guiScript = Join-Path -Path $root -ChildPath "launcher\windows\ClawHermes-Control.ps1"
if (-not (Test-Path -LiteralPath $guiScript -PathType Leaf)) {
    throw "Cannot find GUI script: $guiScript"
}

$argumentList = @(
    "-NoProfile",
    "-Sta",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    $guiScript,
    "-UsbRoot",
    $root
)

$startInfo = New-Object System.Diagnostics.ProcessStartInfo
$startInfo.FileName = "powershell.exe"
$startInfo.Arguments = (($argumentList | ForEach-Object { ConvertTo-ProcessArgument -Argument $_ }) -join " ")
$startInfo.CreateNoWindow = $true
$startInfo.UseShellExecute = $false
[void][System.Diagnostics.Process]::Start($startInfo)
