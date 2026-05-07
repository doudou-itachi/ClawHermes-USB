[CmdletBinding()]
param(
    [string] $HttpProxy = "http://127.0.0.1:7897",
    [switch] $SkipInstall,
    [switch] $WebOnly
)

$ErrorActionPreference = "Stop"
$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Push-Location $scriptRoot
try {
    if ($HttpProxy) {
        $env:HTTP_PROXY = $HttpProxy
        $env:HTTPS_PROXY = $HttpProxy
        $env:ALL_PROXY = $HttpProxy
    }
    $env:NO_PROXY = "localhost,127.0.0.1,::1"

    if (-not $SkipInstall) {
        bun install
    }

    bun run build:web
    bun run typecheck

    if (-not $WebOnly) {
        node .\node_modules\electrobun\bin\electrobun.cjs build --env=canary --platform=win

        $csc = Get-Command csc.exe -ErrorAction SilentlyContinue
        if (-not $csc) {
            $frameworkCsc = Join-Path $env:WINDIR "Microsoft.NET\Framework64\v4.0.30319\csc.exe"
            if (Test-Path -LiteralPath $frameworkCsc) {
                $csc = Get-Item -LiteralPath $frameworkCsc
            }
        }
        if (-not $csc) {
            throw "csc.exe was not found; cannot build the portable Electrobun launcher."
        }

        $cscPath = if ($csc.Source) { $csc.Source } else { $csc.FullName }
        $wrapperOut = Join-Path $scriptRoot "build\canary-win-x64\ClawHermes-Control-Electrobun.exe"
        & $cscPath /nologo /target:winexe /optimize+ /reference:System.Windows.Forms.dll /out:$wrapperOut .\portable-wrapper\ClawHermesControlLauncher.cs
    }
} finally {
    Pop-Location
}
