[CmdletBinding()]
param(
    [string] $OutputRoot,

    [string] $UsbRoot,

    [switch] $Clean,

    [switch] $IncludeData,

    [switch] $NoPayloads,

    [switch] $SkipBuild,

    [switch] $NoStop,

    [switch] $NoBundleHostRuntimes
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

function Copy-SkillsPayload {
    $source = Join-Path $script:SourceRoot "skills"
    $target = Join-Path $script:TargetRoot "skills"
    $policy = "Portable skills are stored outside apps/openclaw and loaded through OpenClaw skills.load.extraDirs."

    if (Test-Path -LiteralPath $source -PathType Container) {
        Copy-Tree -Source $source -Destination $target -ExcludedDirectoryNames @(".git", ".github", ".vscode", "node_modules", "__pycache__") -ExcludedFileNames @(".gitignore", ".dockerignore")
        $skillCount = @(Get-ChildItem -LiteralPath $target -Recurse -File -Filter "SKILL.md" -ErrorAction SilentlyContinue).Count
        $script:SkillsPayload = [ordered]@{
            source = $source
            target = $target
            included = $true
            skillCount = $skillCount
            policy = $policy
        }
        $script:CopiedPaths += [ordered]@{
            path = "skills"
            source = $source
            target = $target
        }
        return
    }

    New-Item -ItemType Directory -Force -Path $target | Out-Null
    $script:SkillsPayload = [ordered]@{
        source = $source
        target = $target
        included = $false
        skillCount = 0
        policy = $policy
    }
    $script:Warnings += "No skills directory found under source root; release includes an empty portable skills directory."
}

function Copy-PyQtControlToRoot {
    param([Parameter(Mandatory = $true)][string] $ReleaseRoot)

    $pyqtDist = Join-Path $script:SourceRoot "launcher\pyqt\dist\ClawHermes-Control"
    $pyqtExe = Join-Path $pyqtDist "ClawHermes-Control.exe"
    if (-not (Test-Path -LiteralPath $pyqtExe -PathType Leaf)) {
        throw "PyQt control executable is missing: $pyqtExe. Run launcher\pyqt\build.ps1 or build this release without -SkipBuild."
    }

    Copy-Tree -Source $pyqtDist -Destination $ReleaseRoot
    $script:CopiedPaths += [ordered]@{
        path = "ClawHermes-Control.exe"
        source = $pyqtExe
        target = (Join-Path $ReleaseRoot "ClawHermes-Control.exe")
    }
}

function New-QuickStart {
    param([Parameter(Mandatory = $true)][string] $ReleaseRoot)

    $quickStartPath = Join-Path $ReleaseRoot "START_HERE.txt"
    $content = @'
ClawHermes-USB 交付包

普通用户：
1. 双击本目录下的 ClawHermes-Control.exe。
2. 控制面板会自动拉起本地控制服务。
3. 在控制面板里配置 API URL、模型名称和 API Key。
4. 点击 Start 启动 OpenClaw、Hermes Agent、Hermes Web UI 和 Portal。
5. 使用完成后点击 Stop，或关闭控制面板。

交付说明：
- release-manifest.json 记录来源目录、入口策略、payload 列表和裁剪规则。
- 根目录只开放 PyQt 控制面板入口；内部 Node/Python/PowerShell 文件由控制面板调用。
- 如果 manifest 提示 portable runtime missing，需要在交付前补齐 runtimes/windows/node 和 runtimes/windows/python，或确保目标机器 PATH 中已有对应运行时。
'@
    Write-Utf8File -Path $quickStartPath -Value $content
}

function Invoke-ReleaseCommand {
    param(
        [Parameter(Mandatory = $true)][string] $Title,
        [Parameter(Mandatory = $true)][string] $FilePath,
        [Parameter(Mandatory = $true)][string[]] $Arguments,
        [Parameter(Mandatory = $true)][string] $WorkingDirectory
    )

    Write-Output "==> $Title"
    Push-Location $WorkingDirectory
    try {
        $commandLine = (@($FilePath) + $Arguments | ForEach-Object { ConvertTo-CmdArgument $_ }) -join " "
        & cmd.exe /d /c $commandLine
        if ($LASTEXITCODE -ne 0) {
            throw "$Title failed with exit code $LASTEXITCODE."
        }
    } finally {
        Pop-Location
    }
}

function ConvertTo-CmdArgument {
    param([Parameter(Mandatory = $true)][string] $Value)

    if ($Value -notmatch '[\s"`&|<>^]') {
        return $Value
    }
    return '"' + ($Value -replace '"', '\"') + '"'
}

function Stop-LocalControlServices {
    $metadataPath = Join-Path $script:SourceRoot "data\tmp\control-server.json"
    if (-not (Test-Path -LiteralPath $metadataPath -PathType Leaf)) {
        return
    }

    try {
        $metadata = Get-Content -LiteralPath $metadataPath -Raw | ConvertFrom-Json
        $baseUrl = ([string] $metadata.url).TrimEnd("/")
        if ([string]::IsNullOrWhiteSpace($baseUrl)) {
            return
        }
        Invoke-RestMethod -Method Post -Uri "$baseUrl/api/services/stop" -Body "{}" -ContentType "application/json" -TimeoutSec 5 | Out-Null
        Invoke-RestMethod -Method Post -Uri "$baseUrl/api/shutdown" -Body "{}" -ContentType "application/json" -TimeoutSec 5 | Out-Null
        Start-Sleep -Seconds 1
    } catch {
        $script:Warnings += "Could not stop existing control server cleanly: $($_.Exception.Message)"
    }
}

function Invoke-ReleaseBuilds {
    if (Test-Path -LiteralPath (Join-Path $script:SourceRoot "package.json") -PathType Leaf) {
        Invoke-ReleaseCommand -Title "Build ClawHermes Node control core" -FilePath "npm" -Arguments @("run", "build") -WorkingDirectory $script:SourceRoot
    }

    $webUiRoot = Join-Path $script:SourceRoot "apps\hermes-web-ui"
    if (Test-Path -LiteralPath (Join-Path $webUiRoot "package.json") -PathType Leaf) {
        Invoke-ReleaseCommand -Title "Build Hermes Web UI with local Windows fixes" -FilePath "npm" -Arguments @("run", "build") -WorkingDirectory $webUiRoot
    }

    $pyqtBuild = Join-Path $script:SourceRoot "launcher\pyqt\build.ps1"
    if (Test-Path -LiteralPath $pyqtBuild -PathType Leaf) {
        Invoke-ReleaseCommand -Title "Build PyQt control executable" -FilePath "powershell" -Arguments @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $pyqtBuild) -WorkingDirectory $script:SourceRoot
    }
}

function Ensure-WeixinChannelPluginPayload {
    if ($NoPayloads) {
        return
    }

    $policy = $script:ChannelPluginPolicy.weixin
    $openclawRoot = Join-Path $script:SourceRoot "apps\openclaw"
    if (-not (Test-Path -LiteralPath $openclawRoot -PathType Container)) {
        $policy.included = $false
        $policy.reason = "OpenClaw payload is not present."
        return
    }

    $pluginPath = Join-Path $openclawRoot "node_modules\@tencent-weixin\openclaw-weixin"
    if (Test-Path -LiteralPath $pluginPath -PathType Container) {
        $policy.included = $true
        $policy.source = $pluginPath
        return
    }

    $packageJson = Join-Path $openclawRoot "package.json"
    if (-not (Test-Path -LiteralPath $packageJson -PathType Leaf)) {
        throw "OpenClaw WeChat channel plugin is missing, and apps\openclaw\package.json was not found. Rebuild or repair the OpenClaw payload before creating the USB release."
    }

    $pnpmCommand = Get-Command pnpm -ErrorAction SilentlyContinue
    if ($null -eq $pnpmCommand) {
        throw "OpenClaw WeChat channel plugin is missing: apps\openclaw\node_modules\@tencent-weixin\openclaw-weixin. Install pnpm or add the plugin to the OpenClaw payload before creating the USB release."
    }

    $storeArguments = Get-ExistingPnpmStoreArguments -ProjectRoot $openclawRoot
    $installArguments = @("--config.minimum-release-age=0") + $storeArguments + @("add", "-w", "@tencent-weixin/openclaw-weixin")
    $policy.installAttempted = $true
    $policy.installCommand = "pnpm $($installArguments -join ' ')"
    Invoke-ReleaseCommand -Title "Install OpenClaw WeChat channel plugin" -FilePath "pnpm" -Arguments $installArguments -WorkingDirectory $openclawRoot

    if (-not (Test-Path -LiteralPath $pluginPath -PathType Container)) {
        throw "OpenClaw WeChat channel plugin install completed, but the plugin directory is still missing: $pluginPath"
    }

    $policy.included = $true
    $policy.source = $pluginPath
}

function Get-ExistingPnpmStoreArguments {
    param([Parameter(Mandatory = $true)][string] $ProjectRoot)

    $modulesManifest = Join-Path $ProjectRoot "node_modules\.modules.yaml"
    if (-not (Test-Path -LiteralPath $modulesManifest -PathType Leaf)) {
        return @()
    }

    $raw = Get-Content -LiteralPath $modulesManifest -Raw
    $storeDir = $null
    try {
        $parsed = $raw | ConvertFrom-Json
        $storeDir = [string] $parsed.storeDir
    } catch {
        if ($raw -match 'storeDir["'':\s]+(?<quote>["'']?)(?<value>[^"'',\r\n]+)\k<quote>') {
            $storeDir = $Matches.value
        }
    }

    if ([string]::IsNullOrWhiteSpace($storeDir)) {
        return @()
    }

    return @("--store-dir", $storeDir)
}

function Copy-HostRuntimesIfMissing {
    if (-not (Test-Path -LiteralPath (Join-Path $script:TargetRoot "runtimes\windows\node\node.exe") -PathType Leaf)) {
        Copy-HostNodeRuntime
    }
    if (-not (Test-Path -LiteralPath (Join-Path $script:TargetRoot "runtimes\windows\python\python.exe") -PathType Leaf)) {
        Copy-HostPythonRuntime
    }
}

function Copy-HostNodeRuntime {
    $command = Get-Command node.exe -ErrorAction SilentlyContinue
    if ($null -eq $command) {
        $script:Warnings += "Host node.exe was not found; release will require Node.js on the target PATH."
        return
    }

    $source = [string] $command.Source
    $target = Join-Path $script:TargetRoot "runtimes\windows\node\node.exe"
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $target) | Out-Null
    Copy-Item -LiteralPath $source -Destination $target -Force
    $script:CopiedPaths += [ordered]@{
        path = "runtimes/windows/node/node.exe"
        source = $source
        target = $target
    }
}

function Copy-HostPythonRuntime {
    $command = Get-Command python.exe -ErrorAction SilentlyContinue
    if ($null -eq $command) {
        $script:Warnings += "Host python.exe was not found; release will require Python on the target PATH."
        return
    }

    $sourceRoot = Split-Path -Parent ([string] $command.Source)
    $targetRoot = Join-Path $script:TargetRoot "runtimes\windows\python"
    New-Item -ItemType Directory -Force -Path $targetRoot | Out-Null

    foreach ($name in @("DLLs", "Lib", "libs")) {
        $source = Join-Path $sourceRoot $name
        if (Test-Path -LiteralPath $source) {
            $excluded = @("__pycache__", "test", "tests")
            if ($name -eq "Lib") {
                $excluded += @("site-packages")
            }
            Copy-Tree -Source $source -Destination (Join-Path $targetRoot $name) -ExcludedDirectoryNames $excluded -ExcludedFileNames @("*.pyc", "*.pyo")
        }
    }

    foreach ($pattern in @("python.exe", "pythonw.exe", "python3*.dll", "python*.dll", "vcruntime*.dll", "LICENSE.txt")) {
        foreach ($file in Get-ChildItem -LiteralPath $sourceRoot -Filter $pattern -File -ErrorAction SilentlyContinue) {
            Copy-Item -LiteralPath $file.FullName -Destination (Join-Path $targetRoot $file.Name) -Force
        }
    }

    $script:CopiedPaths += [ordered]@{
        path = "runtimes/windows/python"
        source = $sourceRoot
        target = $targetRoot
    }
}

if ([string]::IsNullOrWhiteSpace($UsbRoot)) {
    $UsbRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
}

$script:SourceRoot = Resolve-FullPath $UsbRoot
if ([string]::IsNullOrWhiteSpace($OutputRoot)) {
    $OutputRoot = Join-Path $script:SourceRoot "dist-usb\ClawHermes"
}
$script:TargetRoot = Resolve-FullPath $OutputRoot
$script:CopiedPaths = @()
$script:AppPayloads = @()
$script:SkillsPayload = $null
$script:Warnings = @()
$script:SkippedReparsePoints = @()
$script:ChannelPluginPolicy = [ordered]@{
    weixin = [ordered]@{
        package = "@tencent-weixin/openclaw-weixin"
        relativePath = "apps/openclaw/node_modules/@tencent-weixin/openclaw-weixin"
        included = $false
        installAttempted = $false
        installCommand = $null
        source = $null
        reason = $null
    }
}

if (-not (Test-Path -LiteralPath $script:SourceRoot -PathType Container)) {
    throw "UsbRoot does not exist or is not a directory: $script:SourceRoot"
}

if ($script:TargetRoot.Equals($script:SourceRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "OutputRoot must be different from UsbRoot."
}

if (-not $NoStop) {
    Stop-LocalControlServices
}

if (-not $SkipBuild) {
    Invoke-ReleaseBuilds
}

if ((Test-Path -LiteralPath $script:TargetRoot) -and $Clean) {
    Remove-Item -LiteralPath $script:TargetRoot -Recurse -Force
}

if ((Test-Path -LiteralPath $script:TargetRoot) -and -not $Clean) {
    throw "OutputRoot already exists. Re-run with -Clean or choose an empty target: $script:TargetRoot"
}

New-Item -ItemType Directory -Force -Path $script:TargetRoot | Out-Null

$runtimePaths = @(
    "core/node/dist",
    "adapters",
    "config",
    "portal",
    "runtimes"
)

foreach ($relativePath in $runtimePaths) {
    Copy-ReleasePath -RelativePath $relativePath
}

if (-not $NoBundleHostRuntimes) {
    Copy-HostRuntimesIfMissing
}

$requiredPayloadFiles = @(
    "core/node/dist/clawhermes.js"
)

foreach ($relativePath in $requiredPayloadFiles) {
    $targetPath = Join-Path $script:TargetRoot $relativePath
    if (-not (Test-Path -LiteralPath $targetPath -PathType Leaf)) {
        throw "Required release payload is missing: $relativePath. Prepare this artifact before building the USB release."
    }
}

foreach ($relativePath in @("runtimes/windows/node/node.exe", "runtimes/windows/python/python.exe")) {
    $targetPath = Join-Path $script:TargetRoot $relativePath
    if (-not (Test-Path -LiteralPath $targetPath -PathType Leaf)) {
        $script:Warnings += "Portable runtime is missing in release: $relativePath. The target machine must provide this runtime on PATH unless you install it before shipping."
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

Ensure-WeixinChannelPluginPayload

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

Copy-SkillsPayload
Copy-PyQtControlToRoot -ReleaseRoot $script:TargetRoot
New-QuickStart -ReleaseRoot $script:TargetRoot

$manifest = [ordered]@{
    schemaVersion = 1
    profile = "runtime-payload"
    generatedAt = (Get-Date).ToUniversalTime().ToString("o")
    sourceRoot = $script:SourceRoot
    outputRoot = $script:TargetRoot
    includeData = [bool] $IncludeData
    payloadsIncluded = -not [bool] $NoPayloads
    entryPoint = "ClawHermes-Control.exe"
    rootEntrypointPolicy = "Only the PyQt control executable is placed at the release root. Legacy VBS/PowerShell launchers are not exposed as root entrypoints."
    build = [ordered]@{
        skipped = [bool] $SkipBuild
        stoppedExistingServices = -not [bool] $NoStop
        bundledHostRuntimes = -not [bool] $NoBundleHostRuntimes
    }
    appPayloadPolicy = [ordered]@{
        purpose = "Copy runnable upstream payloads while removing checkout metadata, tests, examples, caches, and unsafe reparse points."
        excludedDirectoryNames = $appExcludedDirectoryNames
        excludedFileNames = $appExcludedFileNames
        note = "Some upstream projects may still require source-like runtime directories. The manifest lists any retained candidates for release review."
    }
    channelPluginPolicy = $script:ChannelPluginPolicy
    skillsPayload = $script:SkillsPayload
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
