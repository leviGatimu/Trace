<#
.SYNOPSIS
    Watches a running tracker for resource leaks.

.DESCRIPTION
    Samples the tracker's memory, handle count and thread count, plus the size
    of the database, and writes a CSV. Deliberately passive — it drives no
    input, so it can run for hours underneath real use without getting in the
    way. That also makes it a better test than a synthetic switch loop: the
    activity it observes is the activity the product will actually see.

    The suspicion it exists to check: the foreground watcher re-installs its
    title hook on every application switch, which is the most plausible place
    for a handle to leak over a long session.

    Run:  powershell -File scripts/soak.ps1 -Hours 8
#>
[CmdletBinding()]
param(
    [double] $Hours = 8,
    [int] $IntervalSeconds = 60,
    [string] $OutFile = "$env:LOCALAPPDATA\Trace\Logs\soak.csv"
)

$ErrorActionPreference = 'Stop'
$deadline = (Get-Date).AddHours($Hours)
$database = "$env:LOCALAPPDATA\Trace\Data\activity.db"

'timestamp,pid,workingSetMb,privateMb,handles,threads,dbMb,sessions' |
    Set-Content -Path $OutFile -Encoding ascii

while ((Get-Date) -lt $deadline) {
    $tracker = Get-Process TraceTracker -ErrorAction SilentlyContinue | Select-Object -First 1

    if ($tracker) {
        $dbMb = 0
        if (Test-Path $database) {
            # Include the WAL: a checkpoint that never runs shows up here first.
            $dbMb = [math]::Round(
                ((Get-ChildItem "$database*" | Measure-Object Length -Sum).Sum) / 1MB, 2)
        }

        $row = '{0},{1},{2},{3},{4},{5},{6},' -f
            (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'),
            $tracker.Id,
            [math]::Round($tracker.WorkingSet64 / 1MB, 1),
            [math]::Round($tracker.PrivateMemorySize64 / 1MB, 1),
            $tracker.HandleCount,
            $tracker.Threads.Count,
            $dbMb

        Add-Content -Path $OutFile -Value $row
    }
    else {
        Add-Content -Path $OutFile -Value ('{0},,,,,,,tracker not running' -f
            (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'))
    }

    Start-Sleep -Seconds $IntervalSeconds
}

Write-Output "Soak finished. Samples in $OutFile"
