<#
.SYNOPSIS
    Captures the Trace window to a PNG.

.DESCRIPTION
    Sets per-monitor DPI awareness before measuring. Without it, GetWindowRect
    returns virtualised (logical) coordinates while PrintWindow renders at
    physical resolution, so the bitmap is allocated too small and the capture
    is silently cropped — which looks exactly like the interface overflowing
    its window, and is not.
#>
param(
    [string] $Path = "$env:TEMP\trace-shot.png",
    [string] $WindowTitle = 'Trace'
)

Add-Type -AssemblyName System.Drawing

Add-Type -TypeDefinition @"
using System;
using System.Drawing;
using System.Runtime.InteropServices;

public class TraceShot {
    [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h, IntPtr dc, uint flags);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
    [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr value);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);

    [StructLayout(LayoutKind.Sequential)]
    public struct RECT { public int Left, Top, Right, Bottom; }

    // DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2
    static readonly IntPtr PerMonitorV2 = new IntPtr(-4);

    public static void MakeDpiAware() { SetProcessDpiAwarenessContext(PerMonitorV2); }

    public static string Capture(IntPtr window, string path) {
        RECT r;
        GetWindowRect(window, out r);

        int width = r.Right - r.Left;
        int height = r.Bottom - r.Top;

        using (var bitmap = new Bitmap(width, height))
        using (var graphics = Graphics.FromImage(bitmap)) {
            IntPtr dc = graphics.GetHdc();
            // PW_RENDERFULLCONTENT: required for DWM-composited windows.
            PrintWindow(window, dc, 2);
            graphics.ReleaseHdc(dc);
            bitmap.Save(path, System.Drawing.Imaging.ImageFormat.Png);
        }

        return width + "x" + height;
    }

    public static void Focus(IntPtr window) { SetForegroundWindow(window); }
}
"@ -ReferencedAssemblies System.Drawing, System.Drawing.Primitives

# Must happen before anything asks Windows for a size.
[TraceShot]::MakeDpiAware() | Out-Null

# Several processes can own a window with this title — Electron's helpers, and
# an installed copy alongside a development one. Take the largest, which is the
# actual application window rather than a hidden host.
$candidates = Get-Process electron, Trace -ErrorAction SilentlyContinue |
    Where-Object { $_.MainWindowTitle -eq $WindowTitle -and $_.MainWindowHandle -ne 0 } |
    ForEach-Object {
        $r = New-Object TraceShot+RECT
        [void][TraceShot]::GetWindowRect($_.MainWindowHandle, [ref] $r)
        [pscustomobject]@{
            Handle = $_.MainWindowHandle
            Area   = ($r.Right - $r.Left) * ($r.Bottom - $r.Top)
        }
    } |
    Sort-Object Area -Descending

$window = ($candidates | Select-Object -First 1).Handle

if (-not $window) {
    Write-Error "No window titled '$WindowTitle' is open."
    exit 1
}

[TraceShot]::Focus($window)
Start-Sleep -Milliseconds 400

$size = [TraceShot]::Capture($window, $Path)
Write-Output "$Path ($size)"
