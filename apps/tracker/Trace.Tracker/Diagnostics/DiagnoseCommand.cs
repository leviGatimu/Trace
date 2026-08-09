using System.Windows.Forms;
using Trace.Tracker.Engine;
using Trace.Tracker.Windows;

namespace Trace.Tracker.Diagnostics;

/// <summary>
/// <c>TraceTracker.exe --diagnose</c> — Milestone 2's proof of concept.
///
/// Prints live Windows state to the console and writes absolutely nothing: no
/// database, no settings, no session. It exists because the Win32 layer is the
/// one part of Trace that cannot be verified by unit tests — UWP window
/// resolution, elevated processes, multi-monitor foreground behaviour, real
/// lock/unlock and real sleep/wake only tell the truth on a real desktop.
///
/// The rule from the kickoff brief is that the tracker must be proven to detect
/// foreground application, process, window, title, transitions and idle before
/// any dashboard exists. This is how that gets proven.
/// </summary>
internal static class DiagnoseCommand
{
    private const int IdleThresholdSeconds = 300;

    public static int Run()
    {
        ConsoleBridge.Attach();

        var clock = SystemClock.Instance;
        var startedAt = clock.UtcNowMs;

        ConsoleBridge.WriteLine();
        ConsoleBridge.WriteLine("Trace Tracker - diagnostics");
        ConsoleBridge.WriteLine("Read-only. Nothing is recorded. Ctrl+C to stop.");
        ConsoleBridge.WriteLine(new string('-', 78));
        ConsoleBridge.WriteLine();

        // --diagnose deliberately bypasses Log.Redact and prints raw titles:
        // the developer running it is looking at their own screen, and the
        // whole point is to see exactly what Windows reports. Nothing here is
        // persisted, so no title reaches storage.
        using var foreground = new ForegroundWatcher(clock, s => Report(clock, startedAt, s));
        using var idle = new IdleWatcher(clock, s => Report(clock, startedAt, s),
            IdleThresholdSeconds, enabled: true);
        using var systemEvents = new SystemEventWindow(clock, s => Report(clock, startedAt, s),
            () => Task.CompletedTask);

        foreground.Start();
        idle.Start();

        using var statusTimer = new System.Threading.Timer(
            _ => PrintStatus(foreground, idle),
            null,
            TimeSpan.FromSeconds(5),
            TimeSpan.FromSeconds(5));

        // The hooks and the message-only window both need a running pump.
        Application.Run();
        return ExitCodes.Ok;
    }

    private static void Report(IClock clock, long startedAt, Signal signal)
    {
        var elapsed = TimeSpan.FromMilliseconds(signal.AtUtcMs - startedAt);
        var stamp = $"[{elapsed:hh\\:mm\\:ss}]";

        switch (signal)
        {
            case ForegroundChanged f:
                PrintWindow(stamp, "FOREGROUND", f.Hwnd);
                break;

            case WindowTitleChanged w:
                PrintWindow(stamp, "TITLE     ", w.Hwnd);
                break;

            case IdleStarted i:
                var idleFor = TimeSpan.FromMilliseconds(i.AtUtcMs - i.SinceUtcMs);
                ConsoleBridge.WriteLine(
                    $"{stamp} IDLE       started (backdated {idleFor.TotalSeconds:F0}s to last input)");
                break;

            case IdleEnded:
                ConsoleBridge.WriteLine($"{stamp} ACTIVE     user returned");
                break;

            case SessionLocked:
                ConsoleBridge.WriteLine($"{stamp} LOCKED");
                break;

            case SessionUnlocked:
                ConsoleBridge.WriteLine($"{stamp} UNLOCKED");
                break;

            case SystemSuspending:
                ConsoleBridge.WriteLine($"{stamp} SUSPENDING");
                break;

            case SystemResumed:
                ConsoleBridge.WriteLine($"{stamp} RESUMED");
                break;

            case SystemShuttingDown:
                ConsoleBridge.WriteLine($"{stamp} SHUTDOWN");
                break;

            default:
                ConsoleBridge.WriteLine($"{stamp} {signal.GetType().Name}");
                break;
        }
    }

    private static void PrintWindow(string stamp, string label, IntPtr hwnd)
    {
        var app = ProcessIdentity.Resolve(hwnd);
        var title = ProcessIdentity.GetWindowTitle(hwnd) ?? "(no title)";

        if (app is null)
        {
            ConsoleBridge.WriteLine($"{stamp} {label} <unidentifiable window>  \"{title}\"");
            return;
        }

        var path = app.ExecutablePath ?? "(path unavailable — protected or elevated process)";
        ConsoleBridge.WriteLine($"{stamp} {label} {app.DisplayName}  [{app.Executable}, pid {app.ProcessId}]");
        ConsoleBridge.WriteLine($"{new string(' ', stamp.Length)}            \"{title}\"");
        ConsoleBridge.WriteLine($"{new string(' ', stamp.Length)}            {path}");
    }

    private static void PrintStatus(ForegroundWatcher foreground, IdleWatcher idle)
    {
        var seconds = idle.SecondsSinceLastInput();
        var idleText = seconds is { } s ? $"{s}s since input" : "input time unavailable";
        var state = idle.IsIdle ? "IDLE" : "ACTIVE";
        var title = ProcessIdentity.GetWindowTitle(foreground.CurrentWindow) ?? "(no title)";

        ConsoleBridge.WriteLine($"           ...  {state}, {idleText}  |  \"{title}\"");
    }
}
