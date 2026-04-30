param(
    [Parameter(Position = 0)]
    [ValidateSet("env-json", "setup", "start", "status", "stop")]
    [string]$Action = "setup",

    [string]$UsbRoot = (Resolve-Path -LiteralPath (Join-Path -Path $PSScriptRoot -ChildPath "..\..")).Path,

    [switch]$Json
)

$ErrorActionPreference = "Stop"

Import-Module -Force (Join-Path -Path $PSScriptRoot -ChildPath "ClawHermes.Core.psm1")

switch ($Action) {
    "env-json" {
        New-ClawHermesPortableEnvironment -UsbRoot $UsbRoot | ConvertTo-Json -Depth 6
        exit 0
    }
    "setup" {
        $result = Test-ClawHermesSetup -UsbRoot $UsbRoot
        if ($Json) {
            $result | ConvertTo-Json -Depth 8
        }
        else {
            Write-Host "ClawHermes-USB setup diagnostics"
            Write-Host "Root: $($result.root)"
            foreach ($message in $result.messages) {
                Write-Host "- $message"
            }
            if ($result.messages.Count -eq 0) {
                Write-Host "No setup issues found."
            }
        }
        exit 0
    }
    "start" {
        $result = Start-ClawHermesSkeleton -UsbRoot $UsbRoot
        if ($Json) {
            $result | ConvertTo-Json -Depth 8
        }
        else {
            Write-Host "ClawHermes-USB placeholder services started:"
            foreach ($id in $result.started) {
                Write-Host "- $id"
            }
            Write-Host "Portal target: http://127.0.0.1:17000/"
        }
        exit 0
    }
    "status" {
        $result = Get-ClawHermesStatus -UsbRoot $UsbRoot
        if ($Json) {
            $result | ConvertTo-Json -Depth 8
        }
        else {
            Write-Host "ClawHermes-USB status"
            foreach ($service in $result.services) {
                Write-Host "$($service.id): $($service.status)"
            }
        }
        exit 0
    }
    "stop" {
        $result = Stop-ClawHermesSkeleton -UsbRoot $UsbRoot
        if ($Json) {
            $result | ConvertTo-Json -Depth 8
        }
        else {
            Write-Host "ClawHermes-USB placeholder services stopped:"
            foreach ($id in $result.stopped) {
                Write-Host "- $id"
            }
        }
        exit 0
    }
}
