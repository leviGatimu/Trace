<#
.SYNOPSIS
    Builds Trace-Setup.exe.

.DESCRIPTION
    One command, from a clean checkout to an installer someone can double-click.
    In order: brand assets, tracker (self-contained so the machine needs no .NET
    runtime), dashboard, then the NSIS package that carries both executables.

    The result lands in `installer\` at the repository root.
#>
[CmdletBinding()]
param(
    [switch] $SkipIcons
)

$ErrorActionPreference = 'Stop'
$env:DOTNET_CLI_TELEMETRY_OPTOUT = '1'

$root = Split-Path -Parent $PSScriptRoot
$tracker = Join-Path $root 'apps\tracker\Trace.Tracker\Trace.Tracker.csproj'
$desktop = Join-Path $root 'apps\desktop'
$output = Join-Path $root 'installer'

function Step($message) {
    Write-Host ''
    Write-Host "==> $message" -ForegroundColor Cyan
}

# The tracker locks its own binary while running, and the installer cannot
# replace files that are in use.
Get-Process TraceTracker, Trace, electron -ErrorAction SilentlyContinue |
    Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 500

if (-not $SkipIcons) {
    Step 'Brand assets'
    # No --nologo or -v here: dotnet run forwards unrecognised options to the
    # program, and the forge took "--nologo" as its output directory.
    dotnet run --project (Join-Path $root 'tools\Trace.IconForge\Trace.IconForge.csproj') `
        -c Release -- $root
    if ($LASTEXITCODE -ne 0) { throw 'Icon generation failed.' }
}

Step 'Tracker (self-contained, win-x64)'
dotnet publish $tracker -c Release --nologo -v minimal
if ($LASTEXITCODE -ne 0) { throw 'Tracker publish failed.' }

Step 'Tracker tests'
dotnet test (Join-Path $root 'apps\tracker\Trace.Tracker.Tests\Trace.Tracker.Tests.csproj') `
    -c Release --nologo -v quiet
if ($LASTEXITCODE -ne 0) { throw 'Tracker tests failed.' }

Step 'Dashboard'
Push-Location $desktop
try {
    npx tsc --noEmit
    if ($LASTEXITCODE -ne 0) { throw 'Type checking failed.' }

    npx vitest run
    if ($LASTEXITCODE -ne 0) { throw 'Dashboard tests failed.' }

    node scripts/build.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Dashboard build failed.' }

    Step 'Installer'
    npx electron-builder --win --publish never
    if ($LASTEXITCODE -ne 0) { throw 'Packaging failed.' }
}
finally {
    Pop-Location
}

$setup = Get-ChildItem $output -Filter 'Trace-Setup-*.exe' -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1

Write-Host ''
if ($setup) {
    $mb = [math]::Round($setup.Length / 1MB, 1)
    Write-Host "Built $($setup.Name) ($mb MB)" -ForegroundColor Green
    Write-Host "  $($setup.FullName)"
}
else {
    throw "Packaging reported success but no installer was found in $output."
}
