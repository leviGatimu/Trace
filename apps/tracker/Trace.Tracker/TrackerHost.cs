using System.Windows.Forms;
using Trace.Contracts;
using Trace.Tracker.Data;
using Trace.Tracker.Diagnostics;
using Trace.Tracker.Data.Queries;
using Trace.Tracker.Engine;
using Trace.Tracker.Ipc;
using Trace.Tracker.Privacy;
using Trace.Tracker.Settings;
using Trace.Tracker.Tray;
using Trace.Tracker.Windows;

namespace Trace.Tracker;

/// <summary>
/// Composition root and lifecycle owner for normal operation.
///
/// Build order is deliberate: settings, then database, then recovery, then the
/// gate, then the engine, and only then the watchers. Nothing can produce a
/// signal before something is ready to record it, and no session is opened
/// before the previous run's interrupted one has been closed.
///
/// <b>Milestone status.</b> Tracking and persistence are live. IPC
/// (Milestone 5) and the tray (Milestone 8) plug in at the marked seams.
/// </summary>
internal static class TrackerHost
{
    private static readonly TimeSpan HeartbeatInterval = TimeSpan.FromSeconds(30);
    private static readonly TimeSpan RetentionSweepInterval = TimeSpan.FromHours(12);

    private static readonly Lock ShutdownGate = new();

    private static SignalQueue? _queue;
    private static PipeServer? _ipc;
    private static TrayIcon? _tray;
    private static SessionEngine? _engine;
    private static TraceDatabase? _database;
    private static SettingsStore? _settings;
    private static IdleWatcher? _idleWatcher;
    private static ForegroundWatcher? _foregroundWatcher;
    private static SystemEventWindow? _systemEvents;
    private static bool _stopped;

    public static int Run()
    {
        TracePaths.EnsureCreated();

        var clock = SystemClock.Instance;
        var previousRunCrashed = RunMarker.ClaimAndCheckPreviousRun(TracePaths.RunMarkerFile);

        var settings = new SettingsStore(TracePaths.SettingsFile);
        _settings = settings;
        Log.DeveloperLogging = settings.Current.DeveloperLogging;

        TraceDatabase database;
        try
        {
            database = TraceDatabase.Open(TracePaths.DatabaseFile, previousRunCrashed);
        }
        catch (TraceDatabaseException ex)
        {
            // Starting without a usable database would mean silently recording
            // nothing while claiming to track. Refuse instead.
            Log.Error("Trace cannot start because its database could not be opened.", ex);
            return ExitCodes.Fatal;
        }

        _database = database;

        if (previousRunCrashed)
        {
            Log.Info("Previous run did not shut down cleanly; recovering.");
            RecoveryService.RecoverInterruptedSessions(database);
        }

        RetentionService.Apply(database, settings.Current.Retention, clock.UtcNowMs);

        var gate = new PrivacyGate(database, settings);
        gate.Degraded += message => Log.Error(message);

        var engine = new SessionEngine(gate, WindowResolver.Instance);
        _engine = engine;

        var queue = new SignalQueue();
        _queue = queue;
        queue.Start((signal, _) =>
        {
            HandleHostConcerns(signal);
            engine.Handle(signal);
            return Task.CompletedTask;
        });

        _foregroundWatcher = new ForegroundWatcher(clock, queue.Post);
        _idleWatcher = new IdleWatcher(
            clock,
            queue.Post,
            settings.Current.IdleThresholdSeconds,
            settings.Current.IdleDetectionEnabled);
        _systemEvents = new SystemEventWindow(clock, queue.Post, FlushAsync);

        settings.Changed += updated =>
        {
            _idleWatcher?.Configure(updated.IdleThresholdSeconds, updated.IdleDetectionEnabled);

            // Applied here rather than in the settings store, so the registry
            // and the setting can never disagree about whether Trace starts
            // with Windows.
            if (StartupRegistration.IsRegistered() != updated.StartWithWindows)
            {
                StartupRegistration.Apply(updated.StartWithWindows);
            }

            queue.Post(new SettingsChanged(clock.UtcNowMs));
        };

        // Reconcile once at startup, with the setting as the authority: it is
        // what the user asked Trace for, and it is what the dashboard shows.
        //
        // Deliberately not the other way round. Deriving the setting from the
        // registry would mean a user enabling startup in Settings found it
        // silently switched off again on the next launch, because the registry
        // had not been written yet.
        //
        // Disabling Trace from Task Manager's Startup tab is unaffected: Windows
        // records that in its own StartupApproved key rather than by removing
        // this value, so that choice still stands.
        if (StartupRegistration.IsRegistered() != settings.Current.StartWithWindows)
        {
            StartupRegistration.Apply(settings.Current.StartWithWindows);
        }

        // Paused survives a restart (DOCS/Privacy.md §27).
        engine.Start(clock.UtcNowMs, startPaused: !settings.Current.TrackingEnabled);

        _foregroundWatcher.Start();
        _idleWatcher.Start();

        using var heartbeat = new System.Threading.Timer(
            _ => queue.Post(new Heartbeat(clock.UtcNowMs)),
            null,
            HeartbeatInterval,
            HeartbeatInterval);

        using var retentionSweep = new System.Threading.Timer(
            _ => RetentionService.Apply(database, settings.Current.Retention, clock.UtcNowMs),
            null,
            RetentionSweepInterval,
            RetentionSweepInterval);

        var startedAt = clock.UtcNowMs;
        var services = new TrackerServices(
            engine,
            gate,
            settings,
            new ActivityQueries(database),
            new SearchQueries(database),
            new DataOperations(database),
            clock,
            queue.Post,
            () => TrackerVersion.Value,
            () => TraceDatabase.CurrentSchemaVersion,
            () => startedAt);

        var ipc = new PipeServer(new RequestRouter(services));
        _ipc = ipc;
        ipc.Start();

        // The dashboard re-queries rather than mutating its own state from a
        // push, so an event only needs to say what became stale.
        settings.Changed += updated => ipc.Broadcast(
            PushEvents.SettingsChanged, new { trackingEnabled = updated.TrackingEnabled });
        gate.Degraded += _ => ipc.Broadcast(
            PushEvents.StateChanged, new { state = nameof(TrackingState.DEGRADED) });

        using var tray = new TrayIcon(
            onPause: () => SetTracking(settings, queue, clock, enabled: false),
            onResume: () => SetTracking(settings, queue, clock, enabled: true),
            onQuit: RequestQuit);

        _tray = tray;
        tray.Update(engine.State, settings.Current.TrackingEnabled);

        // The tray reflects state changes from anywhere — the dashboard, the
        // tray itself, or the engine going idle — so the icon can never disagree
        // with what Trace is actually doing.
        settings.Changed += updated => tray.Update(engine.State, updated.TrackingEnabled);

        using var trayRefresh = new System.Threading.Timer(
            _ => tray.Update(engine.State, settings.Current.TrackingEnabled),
            null,
            TimeSpan.FromSeconds(5),
            TimeSpan.FromSeconds(5));

        Log.Info(
            $"Tracker running. Tracking is {(settings.Current.TrackingEnabled ? "on" : "paused")}.");

        // The WinEvent hooks and the message-only window both require a pump on
        // this thread; Application.Run provides it and blocks until ExitThread.
        Application.Run();

        Shutdown(EndReason.TRACKING_PAUSED);
        return ExitCodes.Ok;
    }

    /// <summary>
    /// Called from the unhandled-exception handler. In-memory state can no
    /// longer be trusted, so the open session is closed conservatively and the
    /// process stops writing.
    /// </summary>
    public static void RequestEmergencyShutdown()
    {
        Shutdown(EndReason.CRASH_RECOVERY);
        Application.ExitThread();
    }

    /// <summary>
    /// "Quit Trace" from the tray.
    ///
    /// Distinct from pausing (DOCS/Windows Integration §12): quitting stops the
    /// tracker entirely, whereas pausing leaves it running and recording
    /// nothing. Quitting is temporary in the sense that startup will bring it
    /// back at the next sign-in if that is enabled — pausing is the one that
    /// persists, which is the right way round.
    ///
    /// No confirmation dialog. §10 asks to avoid nagging for ordinary actions,
    /// and the tray icon disappearing is unmistakable feedback.
    /// </summary>
    private static void RequestQuit()
    {
        Log.Info("Quit requested from the tray.");
        Shutdown(EndReason.TRACKING_PAUSED);
        Application.ExitThread();
    }

    /// <summary>
    /// Pause and resume from the tray, taking exactly the path the dashboard
    /// takes: write the setting first, then signal the engine. One code path,
    /// so the two controls cannot behave differently.
    /// </summary>
    private static void SetTracking(
        SettingsStore settings, SignalQueue queue, IClock clock, bool enabled)
    {
        settings.Update(current => current with { TrackingEnabled = enabled });

        var now = clock.UtcNowMs;
        queue.Post(enabled ? new ResumeRequested(now) : new PauseRequested(now));
    }

    /// <summary>
    /// Host-level reactions that sit alongside the engine's own handling.
    ///
    /// The engine decides what the history says; these keep the machinery around
    /// it consistent — re-seeding the foreground after an interruption, and
    /// getting the WAL onto disk before the machine stops being able to.
    /// </summary>
    private static void HandleHostConcerns(Signal signal)
    {
        switch (signal)
        {
            case SessionUnlocked or SystemResumed:
                // The engine re-reads the foreground itself; the watcher must
                // also re-point its title hook at whatever is now in front.
                _foregroundWatcher?.AdoptForegroundWindow(
                    NativeMethods.GetForegroundWindow(), emitSignal: false);
                _idleWatcher?.ResetSilently();
                break;

            case SessionLocked or SystemSuspending:
                _idleWatcher?.ResetSilently();
                _database?.Checkpoint();
                break;

            case StopRequested:
                Application.ExitThread();
                break;
        }
    }

    /// <summary>
    /// Closes the open session and gets everything on disk. Safe to call more
    /// than once and from a shutdown message handler.
    /// </summary>
    private static Task FlushAsync()
    {
        Shutdown(EndReason.SYSTEM_SHUTDOWN);
        return Task.CompletedTask;
    }

    private static void Shutdown(EndReason reason)
    {
        lock (ShutdownGate)
        {
            if (_stopped)
            {
                return;
            }

            _stopped = true;
        }

        Log.Info($"Tracker shutting down ({reason}).");

        try
        {
            // The icon goes first: the moment Trace stops recording, it should
            // stop claiming to.
            _tray?.Dispose();

            // Stop answering before stopping recording, so a client is never
            // served a half-shut-down view of the world.
            _ipc?.DisposeAsync().AsTask().GetAwaiter().GetResult();

            _idleWatcher?.Dispose();
            _foregroundWatcher?.Dispose();

            // Drain first: a transition already queued is real history and must
            // reach the database before the engine is stopped.
            _queue?.DisposeAsync().AsTask().GetAwaiter().GetResult();

            _engine?.Stop(SystemClock.Instance.UtcNowMs, reason);

            _database?.Checkpoint();
            _database?.Dispose();

            _systemEvents?.Dispose();
        }
        catch (Exception ex)
        {
            Log.Error("Error during shutdown; some state may not have been written.", ex);
        }

        // Only once everything is safely on disk: the marker's absence is what
        // tells the next start that this run ended cleanly.
        RunMarker.Release(TracePaths.RunMarkerFile);
    }
}
