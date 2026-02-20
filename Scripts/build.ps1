param()

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$generator = Join-Path $scriptDir "generate-file-index.ps1"

& $generator
Write-Host "Build complete."
