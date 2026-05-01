param(
    [Parameter(Position = 0)]
    [ValidateSet("env-json", "setup", "runtimes", "wsl", "prepare-wsl", "wsl-rootfs-guide", "wsl-import-plan", "wsl-import", "wsl-unregister-plan", "wsl-workflow", "install-runtime", "init-env", "service-env", "adapters", "sources", "probe-sources", "checkout-source", "setup-adapter", "verify-adapter", "mark-adapter-ready", "logs", "backup", "start", "start-adapter", "status", "stop")]
    [string]$Action = "setup",

    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$RemainingArgs,

    [string]$UsbRoot,

    [switch]$Json
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($UsbRoot)) {
    $scriptRoot = $PSScriptRoot
    if ([string]::IsNullOrWhiteSpace($scriptRoot)) {
        $scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
    }
    $UsbRoot = (Resolve-Path -LiteralPath (Join-Path -Path $scriptRoot -ChildPath "..\..")).Path
}

$root = (Resolve-Path -LiteralPath $UsbRoot).Path
$node = Join-Path -Path $root -ChildPath "runtimes\windows\node\node.exe"
if (-not (Test-Path -LiteralPath $node -PathType Leaf)) {
    $nodeCommand = Get-Command node -ErrorAction SilentlyContinue
    if ($null -eq $nodeCommand) {
        throw "Node.js not found. Place portable Node.js at runtimes\windows\node\node.exe or install Node.js for development."
    }
    $node = $nodeCommand.Source
}

$cli = Join-Path -Path $root -ChildPath "core\node\dist\clawhermes.js"
if (-not (Test-Path -LiteralPath $cli -PathType Leaf)) {
    throw "TypeScript core is not built. Run npm run build."
}

$nodeArgs = @($cli, $Action)
if ($RemainingArgs) {
    $nodeArgs += $RemainingArgs
}
$nodeArgs += @("--usb-root", $root)
if ($Json) {
    $nodeArgs += "--json"
}

& $node @nodeArgs
exit $LASTEXITCODE
