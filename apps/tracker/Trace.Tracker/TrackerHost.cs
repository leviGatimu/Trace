using System.Windows.Forms;
using Trace.Tracker.Diagnostics;
using Trace.Tracker.Engine;
using Trace.Tracker.Windows;

namespace Trace.Tracker;

/// <summary>
/// Composition root and lifecycle owner for normal (non-diagnostic) operation.
///
/// Build order matters: watchers are constructed but not started until the
/// consumer is draining, so no signal can be produced with nothing listening.
///
/// <b>Milestone status.</b> Wiring, the signal pipeline and lifecycle are in
/// place. The session engine (Milestone 3), persistence (Milestone 4), IPC
/// (Milestone 5) and the tray (Milestone 8) plug into the marked seams below.
/// Until the engine exists this host observes and logs transitions but records
/// nothing — it does not pretend to track. Use <c>--diagnose</c> to verify the
/// Win32 layer against real Windows behaviour.
/// </summary>
internal static class TrackerHost
{
    private static readonly TimeSpan HeartbeatInterval = TimeSpan.FromSeconds(30);

    private static SignalQueue? _queue;
    private static IdleWatcher? _idleWatcher;
    private static ForegroundWatcher? _foregroundWatcher;
    private static SystemEventWindow? _systemEvents;
    private static int _emergencyShutdownRequested;

    public static int Run()
    {
        TracePaths.EnsureCreated();

        var clock = SystemClock.Instance;

        var queue = new SignalQueue();
        _queue = queue;

        // TODO(Milestone 3-4): construct SessionEngine over PrivacyGate and the
        // repositories, and hand its Handle method to Start below. The engine is
        // the only consumer this queue will ever have.
        queue.Start(HandleSignal);

        _foregroundWatcher = new ForegroundWatcher(clock, queue.Post);
        _idleWatcher = new IdleWatcher(clock, queue.Post, thresholdSeconds: 300, enabled: true);
        _systemEvents = new SystemEventWindow(clock, queue.Post, FlushAsync);

        _foregroundWatcher.Start();
        _idleWatcher.Start();

        using var heartbeat = new System.Threading.Timer(
            _ => queue.Post(new Heartbeat(clock.UtcNowMs)),
            null,
            HeartbeatInterval,
            HeartbeatInterval);

        Log.Info("Tracker running. Message pump started.");

        // The WinEvent hooks and the message-only window both require a pump on
        // this thread; Application.Run provides it and blocks until ExitThread.
        Application.Run();

        ShutdownAsync().GetAwaiter().GetResult();
        return ExitCodes.Ok;
    }

    /// <summary>
    /// Called from the unhandled-exception handler. The in-memory state can no
    /// longer be trusted, so the open session is closed conservatively and the
    /// process stops writing rather than continuing from a state it cannot
    /// vouch for (DOCS/data and database.md §28).
    /// </summary>
    public static void RequestEmergencyShutdown()
    {
        if (Interlocked.Exchange(ref _emergencyShutdownRequested, 1) == 1)
        {
            return;
        }

        try
        {
            FlushAsync().GetAwaiter().GetResult();
        }
        catch (Exception ex)
        {
            Log.Error("Emergency flush failed.", ex);
        }
        finally
        {
            Application.ExitThread();
        }
    }

    /// <summary>
    /// Interim consumer. Replaced by SessionEngine.Handle in Milestone 3.
    /// Observes transitions so the pipeline can be exercised end to end; it
    /// deliberately persists nothing.
    /// </summary>
    private static Task HandleSignal(Signal signal, CancellationToken cancellationToken)
    {
        switch (signal)
        {
            case Heartbeat:
                // TODO(Milestone 4): checkpoint tracker_state.
                break;

            case StopRequested:
                Application.ExitThread();
                break;

            case SessionUnlocked or SystemResumed:
                // DOCS/Tracking.md §I and §J: never assume the previous
                // application is still in front. Re-read the foreground window
                // and let the engine decide what to open.
                _foregroundWatcher?.AdoptForegroundWindow(
                    NativeMethods.GetForegroundWindow(), emitSignal: true);
                _idleWatcher?.ResetSilently();
                break;

            case SessionLocked or SystemSuspending:
                _idleWatcher?.ResetSilently();
                Log.Info($"{signal.GetType().Name}: activity accounting suspended.");
                break;

            default:
                Log.Debug($"Signal: {signal.GetType().Name}");
                break;
        }

        return Task.CompletedTask;
    }

    /// <summary>
    /// Closes the open session and checkpoints the database. Must be safe to
    /// call more than once and from a shutdown message handler.
    /// </summary>
    private static Task FlushAsync()
    {
        // TODO(Milestone 4): close the open session with the appropriate
        // end_reason, write tracker_state, and PRAGMA wal_checkpoint(TRUNCATE).
        Log.Info("Flush requested.");
        return Task.CompletedTask;
    }

    private static async Task ShutdownAsync()
    {
        Log.Info("Tracker shutting down.");

        _idleWatcher?.Dispose();
        _foregroundWatcher?.Dispose();
        _systemEvents?.Dispose();

        if (_queue is not null)
        {
            await _queue.DisposeAsync();
        }

        await FlushAsync();
    }
}
