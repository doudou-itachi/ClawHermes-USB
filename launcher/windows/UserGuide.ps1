param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("Install", "Start", "Stop", "Status", "Backup", "Uninstall", "Repair")]
    [string]$Mode,

    [string]$UsbRoot,

    [switch]$NoPause,

    [switch]$AssumeYes,

    [switch]$PlanOnly
)

$ErrorActionPreference = "Stop"

function Resolve-ClawHermesRoot {
    param([string]$Root)
    if (-not [string]::IsNullOrWhiteSpace($Root)) {
        return (Resolve-Path -LiteralPath $Root).Path
    }
    $scriptRoot = $PSScriptRoot
    return (Resolve-Path -LiteralPath (Join-Path -Path $scriptRoot -ChildPath "..\..")).Path
}

function Write-Section {
    param([string]$Title)
    Write-Host ""
    Write-Host "== $Title =="
}

function Invoke-ClawHermes {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Root,
        [Parameter(Mandatory = $true)]
        [string]$Action,
        [string[]]$Arguments = @()
    )
    $dispatcher = Join-Path -Path $Root -ChildPath "core\windows\clawhermes.ps1"
    if (-not (Test-Path -LiteralPath $dispatcher -PathType Leaf)) {
        throw "Cannot find core dispatcher: $dispatcher"
    }
    & powershell -NoProfile -ExecutionPolicy Bypass -File $dispatcher $Action -UsbRoot $Root @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Command failed: $Action $($Arguments -join ' ')"
    }
}

function Invoke-ClawHermesJson {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Root,
        [Parameter(Mandatory = $true)]
        [string]$Action,
        [string[]]$Arguments = @()
    )
    $dispatcher = Join-Path -Path $Root -ChildPath "core\windows\clawhermes.ps1"
    if (-not (Test-Path -LiteralPath $dispatcher -PathType Leaf)) {
        throw "Cannot find core dispatcher: $dispatcher"
    }
    $output = & powershell -NoProfile -ExecutionPolicy Bypass -File $dispatcher $Action -UsbRoot $Root -Json @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Command failed: $Action $($Arguments -join ' ')"
    }
    return ($output | Out-String | ConvertFrom-Json)
}

function Confirm-GuideAction {
    param(
        [string]$Prompt,
        [string]$RequiredText = "YES"
    )
    if ($AssumeYes) {
        return $true
    }
    $answer = Read-Host "$Prompt Type $RequiredText to continue"
    return $answer -eq $RequiredText
}

function Get-PortalUrl {
    param([string]$Root)
    $portsPath = Join-Path -Path $Root -ChildPath "data\tmp\ports.json"
    if (Test-Path -LiteralPath $portsPath -PathType Leaf) {
        try {
            $ports = Get-Content -LiteralPath $portsPath -Raw | ConvertFrom-Json
            if ($ports.portal.url) {
                return [string]$ports.portal.url
            }
        } catch {
            return "http://127.0.0.1:17000/"
        }
    }
    return "http://127.0.0.1:17000/"
}

function Show-LogHint {
    param([string]$Root)
    $logRoot = Join-Path -Path $Root -ChildPath "data\logs"
    Write-Host "Logs: $logRoot"
}

function Complete-Guide {
    param([string]$Root)
    if (-not $NoPause) {
        Write-Host ""
        Show-LogHint -Root $Root
        Read-Host "Press Enter to close"
    }
}

$root = Resolve-ClawHermesRoot -Root $UsbRoot
$exitCode = 0

try {
    Write-Host "ClawHermes-USB"
    Write-Host "USB root: $root"

    switch ($Mode) {
        "Install" {
            Write-Section "Offline-first install"
            Write-Host "This guide checks the prepared USB payloads before making host changes."
            Invoke-ClawHermes -Root $root -Action "setup-wizard" -Arguments @()
            Invoke-ClawHermes -Root $root -Action "payloads" -Arguments @()
            if ($PlanOnly) {
                Write-Host "Plan-only mode finished. No install actions were run."
                break
            }
            Invoke-ClawHermes -Root $root -Action "init-env" -Arguments @()
            Invoke-ClawHermes -Root $root -Action "wsl-import-plan" -Arguments @("--distro", "Ubuntu")
            if (Confirm-GuideAction -Prompt "Import the managed ClawHermes-Ubuntu WSL distro?" -RequiredText "IMPORT") {
                Invoke-ClawHermes -Root $root -Action "wsl-import" -Arguments @("--distro", "Ubuntu", "--confirm-import")
            } else {
                Write-Host "Skipped WSL import."
            }
            Invoke-ClawHermes -Root $root -Action "start" -Arguments @()
            $portalUrl = Get-PortalUrl -Root $root
            Write-Host "Portal: $portalUrl"
            Start-Process $portalUrl
        }
        "Start" {
            Write-Section "Start"
            Invoke-ClawHermes -Root $root -Action "start" -Arguments @()
            $portalUrl = Get-PortalUrl -Root $root
            Write-Host "Portal: $portalUrl"
            Start-Process $portalUrl
        }
        "Stop" {
            Write-Section "Stop"
            Invoke-ClawHermes -Root $root -Action "stop" -Arguments @()
        }
        "Status" {
            Write-Section "Status"
            $status = Invoke-ClawHermesJson -Root $root -Action "status" -Arguments @()
            foreach ($service in $status.services) {
                Write-Host ("{0}: {1}" -f $service.id, $service.status)
            }
            Write-Host "Portal: $(Get-PortalUrl -Root $root)"
        }
        "Backup" {
            Write-Section "Backup"
            Invoke-ClawHermes -Root $root -Action "backup" -Arguments @()
        }
        "Uninstall" {
            Write-Section "Uninstall host WSL environment"
            Write-Host "This only targets the managed ClawHermes-Ubuntu WSL distribution on this Windows host."
            Write-Host "It does not delete the USB project directory."
            Invoke-ClawHermes -Root $root -Action "wsl-unregister-plan" -Arguments @("--distro", "Ubuntu")
            if ($PlanOnly) {
                Write-Host "Plan-only mode finished. The WSL distribution was not unregistered."
                break
            }
            Invoke-ClawHermes -Root $root -Action "stop" -Arguments @()
            if (Confirm-GuideAction -Prompt "Unregister ClawHermes-Ubuntu from this Windows host?" -RequiredText "UNREGISTER") {
                Invoke-ClawHermes -Root $root -Action "wsl-unregister" -Arguments @("--distro", "Ubuntu", "--confirm-unregister")
            } else {
                Write-Host "Skipped WSL unregister."
            }
        }
        "Repair" {
            Write-Section "Repair or update"
            Write-Host "Normal offline use should not require network actions."
            Invoke-ClawHermes -Root $root -Action "setup" -Arguments @()
            Invoke-ClawHermes -Root $root -Action "payloads" -Arguments @()
            Invoke-ClawHermes -Root $root -Action "runtimes" -Arguments @()
            Invoke-ClawHermes -Root $root -Action "sources" -Arguments @()
        }
    }
} catch {
    $exitCode = 1
    Write-Host ""
    Write-Host "ClawHermes-USB could not finish this action."
    Write-Host $_.Exception.Message
    Show-LogHint -Root $root
} finally {
    Complete-Guide -Root $root
}

exit $exitCode
