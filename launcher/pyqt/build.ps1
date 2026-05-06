$ErrorActionPreference = "Stop"

$scriptRoot = $PSScriptRoot
$entry = Join-Path $scriptRoot "clawhermes_control.py"
$dist = Join-Path $scriptRoot "dist"

python -m pip install -r (Join-Path $scriptRoot "requirements.txt")
python -m PyInstaller `
  --noconfirm `
  --windowed `
  --name "ClawHermes-Control" `
  --distpath $dist `
  $entry

Write-Host "Built ClawHermes-Control.exe under $dist"
