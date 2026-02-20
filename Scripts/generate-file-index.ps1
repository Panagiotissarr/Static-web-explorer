param(
  [string]$SourceFolder = (Join-Path $PSScriptRoot "..\Files"),
  [string]$OutputFile = (Join-Path $PSScriptRoot "..\Assets\JS\files-data.js"),
  [switch]$Watch
)

$ErrorActionPreference = "Stop"

function Get-NormalizedFullPath {
  param([Parameter(Mandatory = $true)][string]$Path)
  return [System.IO.Path]::GetFullPath($Path)
}

function Get-RelativeUnixPath {
  param(
    [Parameter(Mandatory = $true)][string]$BasePath,
    [Parameter(Mandatory = $true)][string]$TargetPath
  )

  $baseUri = [System.Uri]((Get-NormalizedFullPath -Path $BasePath).TrimEnd('\') + '\')
  $targetUri = [System.Uri](Get-NormalizedFullPath -Path $TargetPath)
  $relative = $baseUri.MakeRelativeUri($targetUri).ToString()

  return [System.Uri]::UnescapeDataString($relative).Replace('\', '/')
}

function Write-FileIndex {
  param(
    [Parameter(Mandatory = $true)][string]$Source,
    [Parameter(Mandatory = $true)][string]$Output
  )

  if (-not (Test-Path -LiteralPath $Source -PathType Container)) {
    throw "Source folder not found: $Source"
  }

  $resolvedSource = (Resolve-Path -LiteralPath $Source).Path
  $entries = @(Get-ChildItem -LiteralPath $resolvedSource -Recurse -Force)
  $records = @()

  foreach ($entry in $entries) {
    $records += [PSCustomObject]@{
      path     = Get-RelativeUnixPath -BasePath $resolvedSource -TargetPath $entry.FullName
      type     = if ($entry.PSIsContainer) { "directory" } else { "file" }
      size     = if ($entry.PSIsContainer) { 0 } else { [int64]$entry.Length }
      modified = ([DateTimeOffset]$entry.LastWriteTimeUtc).ToString("o")
    }
  }

  $records = @($records | Sort-Object -Property path)
  if ($records.Count -eq 0) {
    $json = "[]"
  } elseif ($records.Count -eq 1) {
    $json = "[" + ($records[0] | ConvertTo-Json -Depth 4) + "]"
  } else {
    $json = $records | ConvertTo-Json -Depth 4
  }
  $outputText = "window.__FILE_INDEX__ = $json;"

  Set-Content -LiteralPath $Output -Value $outputText -Encoding UTF8
  Write-Host "Wrote $($records.Count) entries to $Output"
}

function Start-IndexWatcher {
  param(
    [Parameter(Mandatory = $true)][string]$Source,
    [Parameter(Mandatory = $true)][string]$Output
  )

  Write-FileIndex -Source $Source -Output $Output
  Write-Host "Watching '$Source' for changes. Press Ctrl+C to stop."

  $watcher = New-Object System.IO.FileSystemWatcher
  $watcher.Path = (Resolve-Path -LiteralPath $Source).Path
  $watcher.IncludeSubdirectories = $true
  $watcher.EnableRaisingEvents = $true
  $watcher.NotifyFilter = [System.IO.NotifyFilters]'FileName, DirectoryName, LastWrite, CreationTime, Size'

  $regA = Register-ObjectEvent -InputObject $watcher -EventName Changed -SourceIdentifier "FileIndexChanged"
  $regB = Register-ObjectEvent -InputObject $watcher -EventName Created -SourceIdentifier "FileIndexCreated"
  $regC = Register-ObjectEvent -InputObject $watcher -EventName Deleted -SourceIdentifier "FileIndexDeleted"
  $regD = Register-ObjectEvent -InputObject $watcher -EventName Renamed -SourceIdentifier "FileIndexRenamed"

  try {
    while ($true) {
      Wait-Event -Timeout 1 | Out-Null
      $events = @(Get-Event -SourceIdentifier FileIndexChanged, FileIndexCreated, FileIndexDeleted, FileIndexRenamed -ErrorAction SilentlyContinue)
      if ($events.Count -gt 0) {
        foreach ($event in $events) {
          Remove-Event -EventIdentifier $event.EventIdentifier -ErrorAction SilentlyContinue
        }

        Start-Sleep -Milliseconds 200
        Write-FileIndex -Source $Source -Output $Output
      }
    }
  } finally {
    Unregister-Event -SourceIdentifier FileIndexChanged -ErrorAction SilentlyContinue
    Unregister-Event -SourceIdentifier FileIndexCreated -ErrorAction SilentlyContinue
    Unregister-Event -SourceIdentifier FileIndexDeleted -ErrorAction SilentlyContinue
    Unregister-Event -SourceIdentifier FileIndexRenamed -ErrorAction SilentlyContinue
    $watcher.Dispose()
  }
}

if ($Watch) {
  Start-IndexWatcher -Source $SourceFolder -Output $OutputFile
} else {
  Write-FileIndex -Source $SourceFolder -Output $OutputFile
}
