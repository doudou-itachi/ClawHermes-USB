[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string] $OutputRoot,

    [string] $UsbRoot,

    [switch] $Clean,

    [switch] $IncludeData,

    [switch] $NoPayloads
)

$ErrorActionPreference = "Stop"

function Resolve-FullPath {
    param([Parameter(Mandatory = $true)][string] $PathValue)

    $existing = Get-Item -LiteralPath $PathValue -ErrorAction SilentlyContinue
    if ($null -ne $existing) {
        return $existing.FullName
    }

    return [System.IO.Path]::GetFullPath($PathValue)
}

function Test-IsSubPath {
    param(
        [Parameter(Mandatory = $true)][string] $Candidate,
        [Parameter(Mandatory = $true)][string] $Parent
    )

    $normalizedCandidate = [System.IO.Path]::GetFullPath($Candidate).TrimEnd('\', '/')
    $normalizedParent = [System.IO.Path]::GetFullPath($Parent).TrimEnd('\', '/')
    return $normalizedCandidate.StartsWith($normalizedParent + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)
}

function Copy-Tree {
    param(
        [Parameter(Mandatory = $true)][string] $Source,
        [Parameter(Mandatory = $true)][string] $Destination,
        [string[]] $ExcludedDirectoryNames = @(),
        [string[]] $ExcludedFileNames = @()
    )

    $sourceItem = Get-Item -LiteralPath $Source -Force
    if (($sourceItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
        Add-SkippedReparsePoint -SourceItem $sourceItem
        return
    }

    if (-not $sourceItem.PSIsContainer) {
        $parent = Split-Path -Parent $Destination
        if ($parent) {
            New-Item -ItemType Directory -Force -Path $parent | Out-Null
        }
        Copy-Item -LiteralPath $Source -Destination $Destination -Force
        return
    }

    New-Item -ItemType Directory -Force -Path $Destination | Out-Null
    foreach ($child in Get-ChildItem -LiteralPath $Source -Force) {
        $childName = [string] ($child.Name)
        if ([string]::IsNullOrWhiteSpace($childName)) {
            $script:SkippedReparsePoints += "(unknown child under $(Get-RelativeReleasePath -Path $Source))"
            continue
        }
        $childFullName = [string] ($child.FullName)
        if ([string]::IsNullOrWhiteSpace($childFullName) -and $child.PSPath) {
            $childFullName = ([string] $child.PSPath) -replace '^Microsoft\.PowerShell\.Core\\FileSystem::', ''
        }
        if ([string]::IsNullOrWhiteSpace($childFullName)) {
            $script:SkippedReparsePoints += "(unknown child path under $(Get-RelativeReleasePath -Path $Source))"
            continue
        }

        $name = $childName.ToLowerInvariant()
        $childDestination = Join-Path $Destination $childName
        if (($child.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
            Add-SkippedReparsePoint -SourceItem $child
            continue
        }

        if ($child.PSIsContainer) {
            if ($ExcludedDirectoryNames -contains $name) {
                continue
            }
            Copy-Tree -Source $childFullName -Destination $childDestination -ExcludedDirectoryNames $ExcludedDirectoryNames -ExcludedFileNames $ExcludedFileNames
        } else {
            if ($ExcludedFileNames -contains $name) {
                continue
            }
            Copy-Item -LiteralPath $childFullName -Destination $childDestination -Force
        }
    }
}

function Write-Utf8File {
    param(
        [Parameter(Mandatory = $true)][string] $Path,
        [Parameter(Mandatory = $true)][string] $Value
    )

    $parent = Split-Path -Parent $Path
    if ($parent) {
        New-Item -ItemType Directory -Force -Path $parent | Out-Null
    }

    $encoding = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($Path, $Value, $encoding)
}

function Add-SkippedReparsePoint {
    param(
        [Parameter(Mandatory = $true)] $SourceItem
    )

    $sourcePath = [string] ($SourceItem.FullName)
    if ([string]::IsNullOrWhiteSpace($sourcePath) -and $SourceItem.PSPath) {
        $sourcePath = ([string] $SourceItem.PSPath) -replace '^Microsoft\.PowerShell\.Core\\FileSystem::', ''
    }
    if ([string]::IsNullOrWhiteSpace($sourcePath)) {
        $sourcePath = [string] $SourceItem
    }
    if ([string]::IsNullOrWhiteSpace($sourcePath)) {
        $script:SkippedReparsePoints += "(unknown reparse point)"
        return $false
    }

    $relativePath = Get-RelativeReleasePath -Path $sourcePath
    $script:SkippedReparsePoints += $relativePath
}

function Get-RelativeReleasePath {
    param([Parameter(Mandatory = $true)][string] $Path)

    $root = [System.IO.Path]::GetFullPath($script:SourceRoot).TrimEnd('\', '/')
    $candidate = [System.IO.Path]::GetFullPath($Path)
    if ($candidate.StartsWith($root + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) {
        return $candidate.Substring($root.Length + 1)
    }

    return $candidate
}

function Copy-ReleasePath {
    param(
        [Parameter(Mandatory = $true)][string] $RelativePath,
        [string[]] $ExcludedDirectoryNames = @(),
        [string[]] $ExcludedFileNames = @()
    )

    $source = Join-Path $script:SourceRoot $RelativePath
    if (-not (Test-Path -LiteralPath $source)) {
        $script:Warnings += "Skipped missing path: $RelativePath"
        return
    }

    $destination = Join-Path $script:TargetRoot $RelativePath
    Copy-Tree -Source $source -Destination $destination -ExcludedDirectoryNames $ExcludedDirectoryNames -ExcludedFileNames $ExcludedFileNames
    $script:CopiedPaths += [ordered]@{
        path = $RelativePath
        source = $source
        target = $destination
    }
}

function New-RootLauncher {
    param([Parameter(Mandatory = $true)][string] $ReleaseRoot)

    $localizedStart = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String("5ZCv5Yqo"))
    $launcherPath = Join-Path $ReleaseRoot ($localizedStart + " ClawHermes.vbs")
    $content = @'
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
root = fso.GetParentFolderName(WScript.ScriptFullName)
target = root & "\launcher\windows\ClawHermes-Control.vbs"
shell.Run Chr(34) & target & Chr(34), 1, False
'@
    Write-Utf8File -Path $launcherPath -Value $content
}

function New-QuickStart {
    param([Parameter(Mandatory = $true)][string] $ReleaseRoot)

    $quickStartPath = Join-Path $ReleaseRoot "START_HERE.txt"
    $quickStartBase64 = "Q2xhd0hlcm1lcy1VU0Ig5Lqk5LuY5YyFCgrnu5nmma7pgJrnlKjmiLfvvJoKMS4g5Y+M5Ye74oCc5ZCv5YqoIENsYXdIZXJtZXMudmJz4oCd5omT5byA5Zu+5b2i5o6n5Yi25Lit5b+D44CCCjIuIOesrOS4gOasoeS9v+eUqOWFiOeCueKAnOWuieijheWQkeWvvOKAne+8jOehruiupCBXU0wg5ZKM6L+Q6KGM5pe25bey5YeG5aSH5aW944CCCjMuIOWcqOKAnOaooeWei+mFjee9ruKAneWhq+WGmSBBUEkgVVJM44CB5qih5Z6L5ZCN56ew5ZKMIEFQSSBLZXnjgIIKNC4g54K54oCc5ZCv5Yqo5pyN5Yqh4oCd77yM5YaN54K54oCc5omT5byA55WM6Z2i4oCd6L+b5YWlIE9wZW5DbGF3IOaIliBIZXJtZXMgV2ViIFVJ44CCCjUuIOeUqOWujOWQjueCueKAnOWBnOatouacjeWKoeKAneOAggoK57uZ5Lqk5LuY5Lq65ZGY77yaCi0g5pys55uu5b2V55SxIHNjcmlwdHMvcmVsZWFzZS9CdWlsZC1Vc2JSZWxlYXNlLnBzMSDnlJ/miJDjgIIKLSByZWxlYXNlLW1hbmlmZXN0Lmpzb24g6K6w5b2V5LqG5p2l5rqQ44CB6KOB5Ymq6KeE5YiZ5ZKMIHBheWxvYWQg5YiX6KGo44CCCi0g5LiN6KaB6K6p5pmu6YCa55So5oi35ZyoIFUg55uY5LiK6L+Q6KGMIG5wbSBpbnN0YWxs44CBcG5wbSBpbnN0YWxs44CBcGlwIGluc3RhbGwg5oiWIHV2IHN5bmPjgII="
    $content = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($quickStartBase64))
    Write-Utf8File -Path $quickStartPath -Value $content
}

if ([string]::IsNullOrWhiteSpace($UsbRoot)) {
    $UsbRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
}

$script:SourceRoot = Resolve-FullPath $UsbRoot
$script:TargetRoot = Resolve-FullPath $OutputRoot
$script:CopiedPaths = @()
$script:AppPayloads = @()
$script:Warnings = @()
$script:SkippedReparsePoints = @()

if (-not (Test-Path -LiteralPath $script:SourceRoot -PathType Container)) {
    throw "UsbRoot does not exist or is not a directory: $script:SourceRoot"
}

if ($script:TargetRoot.Equals($script:SourceRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "OutputRoot must be different from UsbRoot."
}

if (Test-IsSubPath -Candidate $script:TargetRoot -Parent $script:SourceRoot) {
    throw "OutputRoot must not be inside UsbRoot, otherwise the release copy can recursively include itself."
}

if ((Test-Path -LiteralPath $script:TargetRoot) -and $Clean) {
    Remove-Item -LiteralPath $script:TargetRoot -Recurse -Force
}

if ((Test-Path -LiteralPath $script:TargetRoot) -and -not $Clean) {
    throw "OutputRoot already exists. Re-run with -Clean or choose an empty target: $script:TargetRoot"
}

New-Item -ItemType Directory -Force -Path $script:TargetRoot | Out-Null

$runtimePaths = @(
    "launcher",
    "core/windows",
    "core/node/dist",
    "adapters",
    "config",
    "portal",
    "runtimes"
)

foreach ($relativePath in $runtimePaths) {
    Copy-ReleasePath -RelativePath $relativePath
}

$requiredPayloadFiles = @(
    "core/node/dist/clawhermes.js",
    "runtimes/windows/node/node.exe",
    "runtimes/wsl/ubuntu-rootfs.tar",
    "runtimes/wsl/ubuntu-rootfs.tar.sha256"
)

foreach ($relativePath in $requiredPayloadFiles) {
    $targetPath = Join-Path $script:TargetRoot $relativePath
    if (-not (Test-Path -LiteralPath $targetPath -PathType Leaf)) {
        throw "Required release payload is missing: $relativePath. Prepare this artifact before building the USB release."
    }
}

$documentationPaths = @(
    "README.md",
    "README.zh-CN.md",
    "docs"
)

foreach ($relativePath in $documentationPaths) {
    Copy-ReleasePath -RelativePath $relativePath -ExcludedDirectoryNames @(".git", ".github", ".vscode", "node_modules")
}

$dataTarget = Join-Path $script:TargetRoot "data"
if ($IncludeData) {
    Copy-ReleasePath -RelativePath "data" -ExcludedDirectoryNames @("tmp", "cache", "logs")
} else {
    foreach ($relativePath in @("data", "data/logs", "data/tmp", "data/backups", "data/settings", "data/cache")) {
        New-Item -ItemType Directory -Force -Path (Join-Path $script:TargetRoot $relativePath) | Out-Null
    }
    $script:CopiedPaths += [ordered]@{
        path = "data"
        source = "(created empty)"
        target = $dataTarget
    }
}

$appExcludedDirectoryNames = @(
    ".git",
    ".github",
    ".vscode",
    ".idea",
    "test",
    "tests",
    "__tests__",
    "test-fixtures",
    "examples",
    "example",
    "samples",
    "sample",
    "coverage",
    ".cache",
    ".turbo",
    ".next",
    ".vite"
)

$appExcludedFileNames = @(
    ".gitignore",
    ".dockerignore",
    "dockerfile",
    "docker-compose.yml",
    "contributing.md",
    "security.md"
)

if (-not $NoPayloads) {
    $appsRoot = Join-Path $script:SourceRoot "apps"
    if (Test-Path -LiteralPath $appsRoot -PathType Container) {
        New-Item -ItemType Directory -Force -Path (Join-Path $script:TargetRoot "apps") | Out-Null
        foreach ($app in Get-ChildItem -LiteralPath $appsRoot -Directory -Force) {
            $target = Join-Path (Join-Path $script:TargetRoot "apps") $app.Name
            Copy-Tree -Source $app.FullName -Destination $target -ExcludedDirectoryNames $appExcludedDirectoryNames -ExcludedFileNames $appExcludedFileNames

            $retainedSourceLikeDirectories = @()
            foreach ($candidate in @("packages", "agent", "gateway", "hermes_cli", "web", "ui", "plugins", "skills")) {
                if (Test-Path -LiteralPath (Join-Path $target $candidate) -PathType Container) {
                    $retainedSourceLikeDirectories += $candidate
                }
            }

            if ($retainedSourceLikeDirectories.Count -gt 0) {
                $script:Warnings += "App '$($app.Name)' retained source-like runtime directories: $($retainedSourceLikeDirectories -join ', '). Verify license and runtime needs before shipping."
            }

            $script:AppPayloads += [ordered]@{
                serviceId = $app.Name
                source = $app.FullName
                target = $target
                excludedDirectoryNames = $appExcludedDirectoryNames
                excludedFileNames = $appExcludedFileNames
                retainedSourceLikeDirectories = $retainedSourceLikeDirectories
            }
        }
    } else {
        $script:Warnings += "No apps directory found; release will not include upstream app payloads."
    }
}

New-RootLauncher -ReleaseRoot $script:TargetRoot
New-QuickStart -ReleaseRoot $script:TargetRoot

$manifest = [ordered]@{
    schemaVersion = 1
    profile = "runtime-payload"
    generatedAt = (Get-Date).ToUniversalTime().ToString("o")
    sourceRoot = $script:SourceRoot
    outputRoot = $script:TargetRoot
    includeData = [bool] $IncludeData
    payloadsIncluded = -not [bool] $NoPayloads
    appPayloadPolicy = [ordered]@{
        purpose = "Copy runnable upstream payloads while removing checkout metadata, tests, examples, caches, and unsafe reparse points."
        excludedDirectoryNames = $appExcludedDirectoryNames
        excludedFileNames = $appExcludedFileNames
        note = "Some upstream projects may still require source-like runtime directories. The manifest lists any retained candidates for release review."
    }
    copiedPaths = $script:CopiedPaths
    appPayloads = $script:AppPayloads
    skippedReparsePoints = $script:SkippedReparsePoints
    warnings = $script:Warnings
}

$manifestPath = Join-Path $script:TargetRoot "release-manifest.json"
Write-Utf8File -Path $manifestPath -Value ($manifest | ConvertTo-Json -Depth 10)

Write-Output "ClawHermes USB release created:"
Write-Output "  Source: $script:SourceRoot"
Write-Output "  Output: $script:TargetRoot"
Write-Output "  Manifest: $manifestPath"
if ($script:Warnings.Count -gt 0) {
    Write-Output "Warnings:"
    foreach ($warning in $script:Warnings) {
        Write-Output "  - $warning"
    }
}
