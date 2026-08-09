using System.Windows.Forms;
using Trace.Tracker.Engine;
using Trace.Tracker.Windows;

namespace Trace.Tracker.Diagnostics;

/// <summary>
/// <c>TraceTracker.exe --diagnose</c> — the read-only proving ground.
///
/// It runs the real Win32 watchers, the real signal queue and the real
/// <see cref="SessionEngine"/> against the real desktop, and prints both what
/// Windows reported and the sessions the engine derives from it. Nothing is
/// written: no database, no settings, no session, no log line containing a
/// title.
///
/// It exists because the Win32 layer and the engine's behaviour on a live
/// machine are the parts that cannot be proven by unit tests — UWP window
/// resolution, elevated processes, real lock/unlock and real sleep/wake only
/// tell the truth on a real desktop.
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
        ConsoleBridge.WriteLine("Read-only: no database, no settings, nothing written to disk.");
        ConsoleBridge.WriteLine("Switch apps, change a browser tab, walk away, lock the PC.");
        ConsoleBridge.WriteLine("Ctrl+C to stop.");
        ConsoleBridge.WriteLine(new string('-', 78));
        ConsoleBridge.WriteLine();

        // --diagnose deliberately prints raw titles rather than going through
        // Log.Redact: the developer running it is looking at their own screen,
        // and seeing exactly what Windows reported is the whole point. None of
        // it is persisted.
        var sink = new ConsoleSink(startedAt, new HashSet<string>(StringComparer.OrdinalIgnoreCase),
            recordWindowTitles: true);
        var engine = new SessionEngine(sink, WindowResolver.Instance);

        var queue = new SignalQueue();
        using var foreground = new ForegroundWatcher(clock, queue.Post);
        using var idle = new IdleWatcher(clock, queue.Post, IdleThresholdSeconds, enabled: true);
        using var systemEvents = new SystemEventWindow(clock, queue.Post, () => Task.CompletedTask);

        // Same shape as production: every watcher only enqueues, and a single
        // consumer runs the engine. Nothing races.
        queue.Start((signal, _) =>
        {
            ReportRawSignal(startedAt, signal);
            engine.Handle(signal);
            return Task.CompletedTask;
        });

        engine.Start(clock.UtcNowMs, startPaused: false);
        foreground.Start();
        idle.Start();

        using var statusTimer = new System.Threading.Timer(
            _ => PrintStatus(engine, idle),
            null,
            TimeSpan.FromSeconds(15),
            TimeSpan.FromSeconds(15));

        // The hooks and the message-only window both need a running pump.
        Application.Run();

        queue.DisposeAsync().AsTask().GetAwaiter().GetResult();
        return ExitCodes.Ok;
    }

    /// <summary>
    /// Prints what Windows said, before the engine interprets it. Seeing the raw
    /// stream next to the derived sessions is what makes it obvious when the
    /// engine is right and the desktop is noisy — Alt-Tab, for instance, really
    /// does raise several foreground events in under a second.
    /// </summary>
    private static void ReportRawSignal(long startedAt, Signal signal)
    {
        var stamp = $"[{TimeSpan.FromMilliseconds(signal.AtUtcMs - startedAt):hh\\:mm\\:ss}]";

        switch (signal)
        {
            case ForegroundChanged f:
                PrintWindow(stamp, "raw  fg   ", f.Hwnd);
                break;

            case WindowTitleChanged w:
                PrintWindow(stamp, "raw  title", w.Hwnd);
                break;

            case IdleStarted i:
                var backdated = TimeSpan.FromMilliseconds(i.AtUtcMs - i.SinceUtcMs);
                ConsoleBridge.WriteLine(
                    $"{stamp} raw  idle  detected now, backdated {backdated.TotalSeconds:F0}s to last input");
                break;

            case IdleEnded:
                ConsoleBridge.WriteLine($"{stamp} raw  active user returned");
                break;

            case Heartbeat:
                break;

            default:
                ConsoleBridge.WriteLine($"{stamp} raw  {signal.GetType().Name}");
                break;
        }
    }

    private static void PrintWindow(string stamp, string label, IntPtr hwnd)
    {
        var application = ProcessIdentity.Resolve(hwnd);
        var title = ProcessIdentity.GetWindowTitle(hwnd) ?? "(no title)";

        if (application is null)
        {
            ConsoleBridge.WriteLine($"{stamp} {label} <unidentifiable window>  \"{title}\"");
            return;
        }

        ConsoleBridge.WriteLine(
            $"{stamp} {label} {application.DisplayName} [{application.Executable}] \"{title}\"");
    }

    private static void PrintStatus(SessionEngine engine, IdleWatcher idle)
    {
        var seconds = idle.SecondsSinceLastInput();
        var sinceInput = seconds is { } s ? $"{s}s since input" : "input time unavailable";
        var current = engine.CurrentApplication?.DisplayName ?? "nothing tracked";
        var title = engine.CurrentWindowTitle ?? "(no window title)";

        ConsoleBridge.WriteLine(
            $"           ..... {engine.State}, {sinceInput}  |  {current}  \"{title}\"");
    }
}
