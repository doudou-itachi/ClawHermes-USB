function Get-ClawHermesRoot {
    param(
        [Parameter(Mandatory = $true)]
        [string]$UsbRoot
    )

    return (Resolve-Path -LiteralPath $UsbRoot).Path
}

function Join-ClawHermesPath {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Root,
        [Parameter(Mandatory = $true)]
        [string[]]$Parts
    )

    $path = $Root
    foreach ($part in $Parts) {
        $path = Join-Path -Path $path -ChildPath $part
    }
    return $path
}

function New-ClawHermesPortableEnvironment {
    param(
        [Parameter(Mandatory = $true)]
        [string]$UsbRoot
    )

    $root = Get-ClawHermesRoot -UsbRoot $UsbRoot
    $nodeRuntime = Join-ClawHermesPath -Root $root -Parts @("runtimes", "windows", "node")
    $pythonRuntime = Join-ClawHermesPath -Root $root -Parts @("runtimes", "windows", "python")
    $gitRuntime = Join-ClawHermesPath -Root $root -Parts @("runtimes", "windows", "git", "cmd")

    return [ordered]@{
        USB_ROOT = $root
        HOME = Join-ClawHermesPath -Root $root -Parts @("data", "home")
        USERPROFILE = Join-ClawHermesPath -Root $root -Parts @("data", "home")
        APPDATA = Join-ClawHermesPath -Root $root -Parts @("data", "home", "AppData", "Roaming")
        LOCALAPPDATA = Join-ClawHermesPath -Root $root -Parts @("data", "home", "AppData", "Local")
        TEMP = Join-ClawHermesPath -Root $root -Parts @("data", "tmp")
        TMP = Join-ClawHermesPath -Root $root -Parts @("data", "tmp")
        HERMES_HOME = Join-ClawHermesPath -Root $root -Parts @("data", "hermes")
        npm_config_cache = Join-ClawHermesPath -Root $root -Parts @("data", "cache", "npm")
        PIP_CACHE_DIR = Join-ClawHermesPath -Root $root -Parts @("data", "cache", "pip")
        UV_CACHE_DIR = Join-ClawHermesPath -Root $root -Parts @("data", "cache", "uv")
        PATH = "$nodeRuntime;$pythonRuntime;$gitRuntime;$env:PATH"
    }
}

function Get-ClawHermesAdapter {
    param(
        [Parameter(Mandatory = $true)]
        [string]$UsbRoot
    )

    $root = Get-ClawHermesRoot -UsbRoot $UsbRoot
    $adapterRoot = Join-Path -Path $root -ChildPath "adapters"
    if (-not (Test-Path -LiteralPath $adapterRoot -PathType Container)) {
        throw "Adapters directory not found: $adapterRoot"
    }

    $adapters = @()
    foreach ($dir in Get-ChildItem -LiteralPath $adapterRoot -Directory | Sort-Object Name) {
        $descriptor = Join-Path -Path $dir.FullName -ChildPath "adapter.json"
        if (Test-Path -LiteralPath $descriptor -PathType Leaf) {
            $adapter = Get-Content -LiteralPath $descriptor -Raw | ConvertFrom-Json
            $adapters += $adapter
        }
    }
    return $adapters
}

function Test-ClawHermesRelativePath {
    param([AllowNull()][string]$Path)

    if ([string]::IsNullOrWhiteSpace($Path)) {
        return $true
    }
    return -not [System.IO.Path]::IsPathRooted($Path)
}

function Test-ClawHermesAdapter {
    param(
        [Parameter(Mandatory = $true)]
        [object]$Adapter,
        [Parameter(Mandatory = $true)]
        [string[]]$KnownIds
    )

    $errors = New-Object System.Collections.Generic.List[string]

    if ([string]::IsNullOrWhiteSpace($Adapter.id)) {
        $errors.Add("id is required")
    }
    if (-not (Test-ClawHermesRelativePath -Path $Adapter.appDir)) {
        $errors.Add("appDir must be relative")
    }
    if (-not (Test-ClawHermesRelativePath -Path $Adapter.dataDir)) {
        $errors.Add("dataDir must be relative")
    }
    if (-not (Test-ClawHermesRelativePath -Path $Adapter.logFile)) {
        $errors.Add("logFile must be relative")
    }
    if ($Adapter.logFile -and -not ($Adapter.logFile -replace "\\", "/").StartsWith("data/logs/")) {
        $errors.Add("logFile must be under data/logs")
    }
    if (-not (Test-ClawHermesRelativePath -Path $Adapter.pidFile)) {
        $errors.Add("pidFile must be relative")
    }
    if ($Adapter.pidFile -and -not ($Adapter.pidFile -replace "\\", "/").StartsWith("data/tmp/")) {
        $errors.Add("pidFile must be under data/tmp")
    }
    if ($null -eq $Adapter.health) {
        $errors.Add("health is required")
    }
    foreach ($dependency in @($Adapter.dependsOn)) {
        if ($KnownIds -notcontains $dependency) {
            $errors.Add("dependsOn references unknown service: $dependency")
        }
    }

    return [pscustomobject]@{
        id = $Adapter.id
        valid = ($errors.Count -eq 0)
        errors = @($errors)
    }
}

function Get-ClawHermesRuntimeDiagnostics {
    param(
        [Parameter(Mandatory = $true)]
        [string]$UsbRoot
    )

    $root = Get-ClawHermesRoot -UsbRoot $UsbRoot
    $definitions = @(
        @{ name = "node"; label = "Portable Node.js"; path = Join-ClawHermesPath -Root $root -Parts @("runtimes", "windows", "node", "node.exe") },
        @{ name = "python"; label = "Portable Python"; path = Join-ClawHermesPath -Root $root -Parts @("runtimes", "windows", "python", "python.exe") },
        @{ name = "git"; label = "Portable Git"; path = Join-ClawHermesPath -Root $root -Parts @("runtimes", "windows", "git", "cmd", "git.exe") }
    )

    $diagnostics = @()
    foreach ($definition in $definitions) {
        $found = Test-Path -LiteralPath $definition.path -PathType Leaf
        $diagnostics += [pscustomobject]@{
            name = $definition.name
            label = $definition.label
            path = $definition.path
            found = $found
        }
    }
    return $diagnostics
}

function Get-ClawHermesIntegrationReadiness {
    param(
        [Parameter(Mandatory = $true)]
        [object[]]$Adapters
    )

    $readiness = @()
    foreach ($adapter in $Adapters) {
        $integration = $adapter.integration
        $status = "unknown"
        $productionReady = $false
        $summary = "No upstream integration metadata has been recorded for this adapter."
        $verifiedAt = $null
        $sources = @()

        if ($null -ne $integration) {
            if (-not [string]::IsNullOrWhiteSpace($integration.status)) {
                $status = $integration.status
            }
            if ($null -ne $integration.productionReady) {
                $productionReady = [bool]$integration.productionReady
            }
            if (-not [string]::IsNullOrWhiteSpace($integration.summary)) {
                $summary = $integration.summary
            }
            $verifiedAt = $integration.verifiedAt
            $sources = @($integration.sources)
        }

        $readiness += [pscustomobject]@{
            id = $adapter.id
            status = $status
            productionReady = $productionReady
            verifiedAt = $verifiedAt
            summary = $summary
            sources = @($sources)
        }
    }
    return $readiness
}

function Test-ClawHermesDataWritable {
    param(
        [Parameter(Mandatory = $true)]
        [string]$UsbRoot
    )

    $root = Get-ClawHermesRoot -UsbRoot $UsbRoot
    $tmp = Join-ClawHermesPath -Root $root -Parts @("data", "tmp")
    New-Item -ItemType Directory -Force -Path $tmp | Out-Null
    $probe = Join-Path -Path $tmp -ChildPath "write-probe.tmp"

    try {
        Set-Content -LiteralPath $probe -Value "ok" -NoNewline
        Remove-Item -LiteralPath $probe -Force
        return $true
    }
    catch {
        return $false
    }
}

function Test-ClawHermesSetup {
    param(
        [Parameter(Mandatory = $true)]
        [string]$UsbRoot
    )

    $root = Get-ClawHermesRoot -UsbRoot $UsbRoot
    $adapters = @(Get-ClawHermesAdapter -UsbRoot $root)
    $knownIds = @($adapters | ForEach-Object { $_.id })
    $adapterResults = @($adapters | ForEach-Object { Test-ClawHermesAdapter -Adapter $_ -KnownIds $knownIds })
    $runtimeResults = @(Get-ClawHermesRuntimeDiagnostics -UsbRoot $root)
    $readinessResults = @(Get-ClawHermesIntegrationReadiness -Adapters $adapters)
    $dataWritable = Test-ClawHermesDataWritable -UsbRoot $root

    $messages = New-Object System.Collections.Generic.List[string]
    foreach ($runtime in $runtimeResults) {
        if (-not $runtime.found) {
            $messages.Add("$($runtime.label) not found at $($runtime.path).")
        }
    }
    foreach ($adapter in $adapterResults) {
        if (-not $adapter.valid) {
            foreach ($error in $adapter.errors) {
                $messages.Add("Adapter $($adapter.id): $error")
            }
        }
    }
    foreach ($readiness in $readinessResults) {
        if (-not $readiness.productionReady) {
            $messages.Add("Adapter $($readiness.id) integration is not production-ready: $($readiness.summary)")
        }
    }
    if (-not $dataWritable) {
        $messages.Add("Data directory is not writable.")
    }

    return [pscustomobject]@{
        root = $root
        adapters = @($adapterResults)
        runtimes = @($runtimeResults)
        readiness = @($readinessResults)
        dataWritable = $dataWritable
        messages = @($messages)
    }
}

function Resolve-ClawHermesRelativePath {
    param(
        [Parameter(Mandatory = $true)]
        [string]$UsbRoot,
        [Parameter(Mandatory = $true)]
        [string]$RelativePath
    )

    $root = Get-ClawHermesRoot -UsbRoot $UsbRoot
    $parts = ($RelativePath -replace "\\", "/").Split("/", [System.StringSplitOptions]::RemoveEmptyEntries)
    return Join-ClawHermesPath -Root $root -Parts $parts
}

function Get-ClawHermesServiceOrder {
    param(
        [Parameter(Mandatory = $true)]
        [string]$UsbRoot,
        [ValidateSet("start", "stop")]
        [string]$Order = "start"
    )

    $root = Get-ClawHermesRoot -UsbRoot $UsbRoot
    $configPath = Join-ClawHermesPath -Root $root -Parts @("config", "defaults", "services.json")
    $adapters = @(Get-ClawHermesAdapter -UsbRoot $root)
    $adapterById = @{}
    foreach ($adapter in $adapters) {
        $adapterById[$adapter.id] = $adapter
    }

    $ordered = @()
    if (Test-Path -LiteralPath $configPath -PathType Leaf) {
        $config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
        $ids = @()
        if ($Order -eq "start") {
            $ids = @($config.startOrder)
        }
        else {
            $ids = @($config.stopOrder)
        }
        foreach ($id in $ids) {
            if ($adapterById.ContainsKey($id)) {
                $ordered += $adapterById[$id]
            }
        }
    }

    foreach ($adapter in $adapters) {
        if (($ordered | ForEach-Object { $_.id }) -notcontains $adapter.id) {
            $ordered += $adapter
        }
    }

    return $ordered
}

function Start-ClawHermesSkeleton {
    param(
        [Parameter(Mandatory = $true)]
        [string]$UsbRoot
    )

    $root = Get-ClawHermesRoot -UsbRoot $UsbRoot
    $setup = Test-ClawHermesSetup -UsbRoot $root
    $adapters = @(Get-ClawHermesServiceOrder -UsbRoot $root -Order start | Where-Object { $_.enabled -eq $true })
    $started = @()

    foreach ($adapter in $adapters) {
        $pidFile = Resolve-ClawHermesRelativePath -UsbRoot $root -RelativePath $adapter.pidFile
        $logFile = Resolve-ClawHermesRelativePath -UsbRoot $root -RelativePath $adapter.logFile
        $appDir = Resolve-ClawHermesRelativePath -UsbRoot $root -RelativePath $adapter.appDir
        New-Item -ItemType Directory -Force -Path (Split-Path -Parent $pidFile) | Out-Null
        New-Item -ItemType Directory -Force -Path (Split-Path -Parent $logFile) | Out-Null

        $metadata = [ordered]@{
            serviceId = $adapter.id
            displayName = $adapter.displayName
            status = "placeholder-started"
            startedAt = (Get-Date).ToString("o")
            command = $adapter.commands.start
            workingDirectory = $appDir
            logFile = $logFile
            placeholder = $true
        }

        $metadata | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $pidFile -Encoding ASCII
        Add-Content -LiteralPath $logFile -Value "$((Get-Date).ToString("o")) [$($adapter.id)] [INFO] Placeholder service started."
        Write-ClawHermesLog -UsbRoot $root -ServiceId $adapter.id -Level "INFO" -Message "Started placeholder service."
        $started += $adapter.id
    }

    New-ClawHermesPortal -UsbRoot $root | Out-Null
    $portal = Start-ClawHermesPortalServer -UsbRoot $root

    return [pscustomobject]@{
        root = $root
        started = @($started)
        portal = $portal
        setupMessages = @($setup.messages)
    }
}

function ConvertTo-ClawHermesHtml {
    param([AllowNull()][string]$Value)

    if ($null -eq $Value) {
        return ""
    }
    return [System.Net.WebUtility]::HtmlEncode($Value)
}

function New-ClawHermesPortal {
    param(
        [Parameter(Mandatory = $true)]
        [string]$UsbRoot
    )

    $root = Get-ClawHermesRoot -UsbRoot $UsbRoot
    $portalDir = Join-ClawHermesPath -Root $root -Parts @("portal")
    New-Item -ItemType Directory -Force -Path $portalDir | Out-Null
    $portalPath = Join-Path -Path $portalDir -ChildPath "index.html"
    $status = Get-ClawHermesStatus -UsbRoot $root

    $rows = New-Object System.Collections.Generic.List[string]
    foreach ($service in $status.services) {
        $label = ConvertTo-ClawHermesHtml -Value $service.displayName
        $id = ConvertTo-ClawHermesHtml -Value $service.id
        $state = ConvertTo-ClawHermesHtml -Value $service.status
        $logPath = ConvertTo-ClawHermesHtml -Value (($service.logFile.Substring($root.Length).TrimStart("\") -replace "\\", "/"))
        $url = ConvertTo-ClawHermesHtml -Value $service.portalUrl
        if ([string]::IsNullOrWhiteSpace($url)) {
            $urlCell = "<span>Pending upstream URL</span>"
        }
        else {
            $urlCell = "<a href=""$url"">$url</a>"
        }
        $rows.Add("<tr><td>$label</td><td>$id</td><td>$state</td><td>$urlCell</td><td><code>$logPath</code></td></tr>")
    }

    $rootHtml = ConvertTo-ClawHermesHtml -Value $root
    $dataRootHtml = ConvertTo-ClawHermesHtml -Value (Join-ClawHermesPath -Root $root -Parts @("data"))
    $generatedAt = ConvertTo-ClawHermesHtml -Value ((Get-Date).ToString("o"))

    $html = @"
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>ClawHermes-USB Portal</title>
  <style>
    body { font-family: Segoe UI, Arial, sans-serif; margin: 32px; color: #202124; background: #f7f8fa; }
    main { max-width: 1080px; margin: 0 auto; }
    h1 { font-size: 28px; margin: 0 0 16px; }
    section { margin-top: 24px; }
    table { width: 100%; border-collapse: collapse; background: #fff; }
    th, td { border: 1px solid #d8dde6; padding: 10px; text-align: left; vertical-align: top; }
    th { background: #eef2f7; }
    code { font-family: Consolas, monospace; }
  </style>
</head>
<body>
  <main>
    <h1>ClawHermes-USB Portal</h1>
    <section>
      <p><strong>Project root:</strong> <code>$rootHtml</code></p>
      <p><strong>Data root:</strong> <code>$dataRootHtml</code></p>
      <p><strong>Generated:</strong> <code>$generatedAt</code></p>
    </section>
    <section>
      <h2>Services</h2>
      <table>
        <thead>
          <tr><th>Service</th><th>ID</th><th>Status</th><th>URL</th><th>Log</th></tr>
        </thead>
        <tbody>
          $($rows -join "`n          ")
        </tbody>
      </table>
    </section>
    <section>
      <h2>Operations</h2>
      <p>Use <code>launcher/windows/Status.bat</code> to refresh service state and <code>launcher/windows/Stop.bat</code> to stop placeholder services.</p>
    </section>
  </main>
</body>
</html>
"@

    Set-Content -LiteralPath $portalPath -Value $html -Encoding UTF8
    Write-ClawHermesLog -UsbRoot $root -ServiceId "portal" -Level "INFO" -Message "Generated portal/index.html."

    return [pscustomobject]@{
        path = $portalPath
        url = "http://127.0.0.1:17000/"
    }
}

function Get-ClawHermesStatus {
    param(
        [Parameter(Mandatory = $true)]
        [string]$UsbRoot
    )

    $root = Get-ClawHermesRoot -UsbRoot $UsbRoot
    $adapters = @(Get-ClawHermesServiceOrder -UsbRoot $root -Order start)
    $services = @()

    foreach ($adapter in $adapters) {
        $pidFile = Resolve-ClawHermesRelativePath -UsbRoot $root -RelativePath $adapter.pidFile
        $status = "stopped"
        $metadata = $null
        if (Test-Path -LiteralPath $pidFile -PathType Leaf) {
            $metadata = Get-Content -LiteralPath $pidFile -Raw | ConvertFrom-Json
            $status = $metadata.status
        }

        $services += [pscustomobject]@{
            id = $adapter.id
            displayName = $adapter.displayName
            status = $status
            pidFile = $pidFile
            logFile = (Resolve-ClawHermesRelativePath -UsbRoot $root -RelativePath $adapter.logFile)
            portalUrl = $adapter.portal.url
        }
    }

    $portalStatus = Get-ClawHermesPortalStatus -UsbRoot $root
    $services += $portalStatus

    return [pscustomobject]@{
        root = $root
        services = @($services)
    }
}

function Get-ClawHermesPortalPidFile {
    param(
        [Parameter(Mandatory = $true)]
        [string]$UsbRoot
    )

    $root = Get-ClawHermesRoot -UsbRoot $UsbRoot
    return Join-ClawHermesPath -Root $root -Parts @("data", "tmp", "pids", "portal.pid")
}

function Test-ClawHermesProcessAlive {
    param([int]$ProcessId)

    try {
        $process = Get-Process -Id $ProcessId -ErrorAction Stop
        return -not $process.HasExited
    }
    catch {
        return $false
    }
}

function Get-ClawHermesPortalProcess {
    param(
        [Parameter(Mandatory = $true)]
        [string]$UsbRoot
    )

    $root = Get-ClawHermesRoot -UsbRoot $UsbRoot
    $processes = @(Get-CimInstance Win32_Process | Where-Object {
        $_.CommandLine -and
        $_.CommandLine -like "*portal-server.ps1*" -and
        $_.CommandLine -like "*$root*"
    })
    return $processes
}

function Get-ClawHermesPortalProcessById {
    param(
        [Parameter(Mandatory = $true)]
        [string]$UsbRoot,
        [Parameter(Mandatory = $true)]
        [int]$ProcessId
    )

    $root = Get-ClawHermesRoot -UsbRoot $UsbRoot
    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $ProcessId" -ErrorAction SilentlyContinue
    if (
        $process -and
        $process.CommandLine -and
        $process.CommandLine -like "*portal-server.ps1*" -and
        $process.CommandLine -like "*$root*"
    ) {
        return $process
    }
    return $null
}

function Test-ClawHermesTcpPortAvailable {
    param(
        [string]$HostName = "127.0.0.1",
        [int]$Port = 17000
    )

    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Parse($HostName), $Port)
    try {
        $listener.Start()
        return $true
    }
    catch {
        return $false
    }
    finally {
        try {
            $listener.Stop()
        }
        catch {
        }
    }
}

function Test-ClawHermesPortalHttpReady {
    param(
        [int]$TimeoutMilliseconds = 5000
    )

    $deadline = (Get-Date).AddMilliseconds($TimeoutMilliseconds)
    while ((Get-Date) -lt $deadline) {
        try {
            $request = [System.Net.WebRequest]::Create("http://127.0.0.1:17000/")
            $request.Timeout = 500
            $response = $request.GetResponse()
            try {
                if ([int]$response.StatusCode -eq 200) {
                    return $true
                }
            }
            finally {
                $response.Close()
            }
        }
        catch {
            Start-Sleep -Milliseconds 100
        }
    }
    return $false
}

function Start-ClawHermesPortalServer {
    param(
        [Parameter(Mandatory = $true)]
        [string]$UsbRoot
    )

    $root = Get-ClawHermesRoot -UsbRoot $UsbRoot
    $pidFile = Get-ClawHermesPortalPidFile -UsbRoot $root
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $pidFile) | Out-Null

    if (Test-Path -LiteralPath $pidFile -PathType Leaf) {
        $existing = Get-Content -LiteralPath $pidFile -Raw | ConvertFrom-Json
        if ($existing.processId -and (Get-ClawHermesPortalProcessById -UsbRoot $root -ProcessId ([int]$existing.processId))) {
            return $existing
        }
        Remove-Item -LiteralPath $pidFile -Force
    }

    $existingPortalProcess = @(Get-ClawHermesPortalProcess -UsbRoot $root | Select-Object -First 1)
    if ($existingPortalProcess.Count -gt 0) {
        $processId = [int]$existingPortalProcess[0].ProcessId
        $metadata = [ordered]@{
            serviceId = "portal"
            displayName = "Portal"
            status = "running"
            processId = $processId
            startedAt = (Get-Date).ToString("o")
            url = "http://127.0.0.1:17000/"
            logFile = (Join-ClawHermesPath -Root $root -Parts @("data", "logs", "portal.log"))
        }
        $metadata | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $pidFile -Encoding ASCII
        Write-ClawHermesLog -UsbRoot $root -ServiceId "portal" -Level "INFO" -Message "Reused existing portal server on http://127.0.0.1:17000/."
        return [pscustomobject]$metadata
    }

    if (-not (Test-ClawHermesTcpPortAvailable -HostName "127.0.0.1" -Port 17000)) {
        throw "Port 17000 is already in use. Stop the conflicting process or change config/defaults/ports.json."
    }

    $serverScript = Join-ClawHermesPath -Root $root -Parts @("core", "windows", "portal-server.ps1")
    $logFile = Join-ClawHermesPath -Root $root -Parts @("data", "logs", "portal.log")
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $logFile) | Out-Null

    $arguments = @(
        "-NoProfile",
        "-ExecutionPolicy", "Bypass",
        "-File", $serverScript,
        "-UsbRoot", $root,
        "-Port", "17000"
    )
    $process = Start-Process -FilePath "powershell.exe" -ArgumentList $arguments -WindowStyle Hidden -PassThru

    if (-not (Test-ClawHermesPortalHttpReady -TimeoutMilliseconds 5000)) {
        if (Get-ClawHermesPortalProcessById -UsbRoot $root -ProcessId $process.Id) {
            Stop-Process -Id $process.Id -Force
        }
        throw "Portal server did not become reachable at http://127.0.0.1:17000/."
    }

    $metadata = [ordered]@{
        serviceId = "portal"
        displayName = "Portal"
        status = "running"
        processId = $process.Id
        startedAt = (Get-Date).ToString("o")
        url = "http://127.0.0.1:17000/"
        logFile = $logFile
    }

    $metadata | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $pidFile -Encoding ASCII
    Write-ClawHermesLog -UsbRoot $root -ServiceId "portal" -Level "INFO" -Message "Started portal server on http://127.0.0.1:17000/."

    return [pscustomobject]$metadata
}

function Get-ClawHermesPortalStatus {
    param(
        [Parameter(Mandatory = $true)]
        [string]$UsbRoot
    )

    $root = Get-ClawHermesRoot -UsbRoot $UsbRoot
    $pidFile = Get-ClawHermesPortalPidFile -UsbRoot $root
    $status = "stopped"

    if (Test-Path -LiteralPath $pidFile -PathType Leaf) {
        $metadata = Get-Content -LiteralPath $pidFile -Raw | ConvertFrom-Json
        if ($metadata.processId -and (Get-ClawHermesPortalProcessById -UsbRoot $root -ProcessId ([int]$metadata.processId))) {
            $status = "running"
        }
        else {
            $portalProcesses = @(Get-ClawHermesPortalProcess -UsbRoot $root)
            if ($portalProcesses.Count -gt 0) {
                $status = "running"
            }
            else {
                $status = "stale"
                Remove-Item -LiteralPath $pidFile -Force
                $status = "stopped"
            }
        }
    }
    elseif (@(Get-ClawHermesPortalProcess -UsbRoot $root).Count -gt 0) {
        $status = "running"
    }

    return [pscustomobject]@{
        id = "portal"
        displayName = "Portal"
        status = $status
        pidFile = $pidFile
        logFile = (Join-ClawHermesPath -Root $root -Parts @("data", "logs", "portal.log"))
        portalUrl = "http://127.0.0.1:17000/"
    }
}

function Stop-ClawHermesPortalServer {
    param(
        [Parameter(Mandatory = $true)]
        [string]$UsbRoot
    )

    $root = Get-ClawHermesRoot -UsbRoot $UsbRoot
    $pidFile = Get-ClawHermesPortalPidFile -UsbRoot $root
    $stopped = $false

    if (Test-Path -LiteralPath $pidFile -PathType Leaf) {
        $metadata = Get-Content -LiteralPath $pidFile -Raw | ConvertFrom-Json
        if ($metadata.processId -and (Get-ClawHermesPortalProcessById -UsbRoot $root -ProcessId ([int]$metadata.processId))) {
            Stop-Process -Id ([int]$metadata.processId) -Force
            $stopped = $true
        }
        Remove-Item -LiteralPath $pidFile -Force
    }

    foreach ($process in @(Get-ClawHermesPortalProcess -UsbRoot $root)) {
        try {
            Stop-Process -Id ([int]$process.ProcessId) -Force
            $stopped = $true
        }
        catch {
        }
    }

    if ($stopped) {
        Start-Sleep -Milliseconds 300
        Write-ClawHermesLog -UsbRoot $root -ServiceId "portal" -Level "INFO" -Message "Stopped portal server."
    }

    return $stopped
}

function Stop-ClawHermesSkeleton {
    param(
        [Parameter(Mandatory = $true)]
        [string]$UsbRoot
    )

    $root = Get-ClawHermesRoot -UsbRoot $UsbRoot
    $adapters = @(Get-ClawHermesServiceOrder -UsbRoot $root -Order stop)
    $stopped = @()

    if (Stop-ClawHermesPortalServer -UsbRoot $root) {
        $stopped += "portal"
    }

    foreach ($adapter in $adapters) {
        $pidFile = Resolve-ClawHermesRelativePath -UsbRoot $root -RelativePath $adapter.pidFile
        if (Test-Path -LiteralPath $pidFile -PathType Leaf) {
            Remove-Item -LiteralPath $pidFile -Force
            Write-ClawHermesLog -UsbRoot $root -ServiceId $adapter.id -Level "INFO" -Message "Stopped placeholder service."
            $stopped += $adapter.id
        }
    }

    return [pscustomobject]@{
        root = $root
        stopped = @($stopped)
    }
}

function Write-ClawHermesLog {
    param(
        [Parameter(Mandatory = $true)]
        [string]$UsbRoot,
        [Parameter(Mandatory = $true)]
        [string]$ServiceId,
        [Parameter(Mandatory = $true)]
        [string]$Level,
        [Parameter(Mandatory = $true)]
        [string]$Message
    )

    $root = Get-ClawHermesRoot -UsbRoot $UsbRoot
    $logDir = Join-ClawHermesPath -Root $root -Parts @("data", "logs")
    New-Item -ItemType Directory -Force -Path $logDir | Out-Null
    $logFile = Join-Path -Path $logDir -ChildPath "launcher.log"
    $timestamp = (Get-Date).ToString("o")
    Add-Content -LiteralPath $logFile -Value "$timestamp [$ServiceId] [$Level] $Message"
}

Export-ModuleMember -Function *
