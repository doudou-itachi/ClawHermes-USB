param(
    [Parameter(Mandatory = $true)]
    [string]$UsbRoot,

    [int]$Port = 17000
)

$ErrorActionPreference = "Stop"

$root = (Resolve-Path -LiteralPath $UsbRoot).Path
$portalFile = Join-Path -Path $root -ChildPath "portal\index.html"
$logFile = Join-Path -Path $root -ChildPath "data\logs\portal.log"
$prefix = "http://127.0.0.1:$Port/"

New-Item -ItemType Directory -Force -Path (Split-Path -Parent $logFile) | Out-Null

function Write-PortalLog {
    param([string]$Message)
    Add-Content -LiteralPath $logFile -Value "$((Get-Date).ToString("o")) [portal] [INFO] $Message"
}

$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add($prefix)

try {
    $listener.Start()
    Write-PortalLog "Listening on $prefix"

    while ($listener.IsListening) {
        try {
            $context = $listener.GetContext()
        }
        catch {
            Write-PortalLog "Listener context failed: $($_.Exception.Message)"
            break
        }
        try {
            $requestPath = $context.Request.Url.AbsolutePath
            if ($requestPath -ne "/" -and $requestPath -ne "/index.html") {
                $context.Response.StatusCode = 404
                $bytes = [System.Text.Encoding]::UTF8.GetBytes("Not found")
            }
            elseif (Test-Path -LiteralPath $portalFile -PathType Leaf) {
                $context.Response.StatusCode = 200
                $context.Response.ContentType = "text/html; charset=utf-8"
                $bytes = [System.IO.File]::ReadAllBytes($portalFile)
            }
            else {
                $context.Response.StatusCode = 503
                $bytes = [System.Text.Encoding]::UTF8.GetBytes("Portal file is not available")
            }

            $context.Response.ContentLength64 = $bytes.Length
            $context.Response.OutputStream.Write($bytes, 0, $bytes.Length)
        }
        catch {
            Write-PortalLog "Request failed: $($_.Exception.Message)"
        }
        finally {
            $context.Response.Close()
        }
    }
}
catch {
    Write-PortalLog "Server failed: $($_.Exception.Message)"
    throw
}
finally {
    if ($listener.IsListening) {
        $listener.Stop()
    }
    $listener.Close()
    Write-PortalLog "Stopped listening on $prefix"
}
