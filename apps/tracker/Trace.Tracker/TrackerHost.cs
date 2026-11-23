using System.Windows.Forms;
using Trace.Contracts;
using Trace.Tracker.Coverage;
using Trace.Tracker.Data;
using Trace.Tracker.Diagnostics;
using Trace.Tracker.Data.Queries;
using Trace.Tracker.Engine;
using Trace.Tracker.Identity;
using Trace.Tracker.Ipc;
using Trace.Tracker.Privacy;
using Trace.Tracker.Protection;
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
    private static readonly TimeSpan WindowsRecordImportInterval = TimeSpan.FromMinutes(30);
    private static readonly TimeSpan ProcessPollInterval = TimeSpan.FromSeconds(2);
    private static readonly TimeSpan AutoRestartCheckInterval = TimeSpan.FromSeconds(60);
    private static Processes.ProcessRecorder? _processes;

    private static readonly Lock ShutdownGate = new();

    private static SignalQueue? _queue;
    private static PipeServer? _ipc;
    private static TrayIcon? _tray;
    private static SessionEngine? _engine;
    private static TraceDatabase? _database;
    private static SettingsStore? _settings;
    private static ProtectionService? _protection;
    private static IdleWatcher? _idleWatcher;
    private static ForegroundWatcher? _foregroundWatcher;
    private static SystemEventWindow? _systemEvents;
    private static bool _stopped;

    public static int Run(bool fromWatchdog = false)
    {
        TracePaths.EnsureCreated();

        var clock = SystemClock.Instance;
        var previousRunCrashed = RunMarker.ClaimAndCheckPreviousRun(TracePaths.RunMarkerFile);

        var settings = new SettingsStore(TracePaths.SettingsFile);
        _settings = settings;
        Log.DeveloperLogging = settings.Current.DeveloperLogging;

        var databaseExisted = File.Exists(TracePaths.DatabaseFile);
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

        // Read before recovery and before this run's first heartbeat replaces it:
        // the last moment the previous run is known to have been recording.
        var lastHeartbeat = database.Read(connection =>
            Data.Repositories.TrackerStateRepository.Read(connection)?.LastHeartbeat);

        var protection = new ProtectionService(
            database,
            clock,
            TraceSandbox.IsActive ? new NoAutoRestart() : new AutoRestartTask());
        _protection = protection;
        var quietRepair = RecordHowLastRunEnded(
            protection, previousRunCrashed, lastHeartbeat, fromWatchdog, databaseExisted, settings, clock);

        // Before anything reads the settings: a hand-edited or unreadable
        // settings.json is put back to what the PIN last allowed.
        protection.CheckSettingsFile(settings);
        settings.Changed += protection.Remember;
        protection.EnsureAutoRestart(logRepair: !quietRepair);

        if (previousRunCrashed)
        {
            Log.Info("Previous run did not shut down cleanly; recovering.");
            RecoveryService.RecoverInterruptedSessions(database);
        }

        RetentionService.Apply(database, settings.Current.Retention, clock.UtcNowMs);
        StartIdentityBackfill(database);

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
            if (!TraceSandbox.IsActive && StartupRegistration.IsRegistered() != updated.StartWithWindows)
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
        if (!TraceSandbox.IsActive && StartupRegistration.IsRegistered() != settings.Current.StartWithWindows)
        {
            StartupRegistration.Apply(settings.Current.StartWithWindows);
        }

        // Paused survives a restart (DOCS/specs/privacy.md §27).
        engine.Start(clock.UtcNowMs, startPaused: !settings.Current.TrackingEnabled);

        _foregroundWatcher.Start();
        _idleWatcher.Start();

        using var heartbeat = new System.Threading.Timer(
            _ => queue.Post(new Heartbeat(clock.UtcNowMs)),
            null,
            HeartbeatInterval,
            HeartbeatInterval);

        // Copies new Windows power, boot and sign-in records. At startup, then
        // every half hour: the System log only keeps weeks of them, and they are
        // what tells a gap in the history from a period of no activity.
        using var windowsRecords = new System.Threading.Timer(
            _ => ImportWindowsRecords(database, settings),
            null,
            TimeSpan.FromSeconds(20),
            WindowsRecordImportInterval);

        // Background apps (opt-in): a snapshot of this session's processes every
        // two seconds while the setting is on and recording is not paused.
        var processes = new Processes.ProcessRecorder(
            database,
            new WindowsProcessSource(),
            new ResolverNamer(),
            executable => settings.Current.ExcludedExecutables.Contains(executable, StringComparer.OrdinalIgnoreCase));
        _processes = processes;
        var processesOn = false;
        using var processPoll = new System.Threading.Timer(
            _ =>
            {
                var wanted = settings.Current.RecordBackgroundApps && settings.Current.TrackingEnabled;
                try
                {
                    if (wanted)
                    {
                        processes.Poll(clock.UtcNowMs);
                    }
                    else if (processesOn)
                    {
                        processes.Stop(clock.UtcNowMs);
                    }

                    processesOn = wanted;
                }
                catch (ObjectDisposedException)
                {
                    // Shutting down.
                }
                catch (Exception ex) when (ex is Microsoft.Data.Sqlite.SqliteException or IOException)
                {
                    Log.Error("Could not record running processes.", ex);
                }
            },
            null,
            TimeSpan.FromSeconds(3),
            ProcessPollInterval);

        // Someone removing or switching off the auto-restart task while Trace
        // runs is put right within a minute, and logged.
        using var autoRestartCheck = new System.Threading.Timer(
            _ => protection.EnsureAutoRestart(logRepair: true),
            null,
            AutoRestartCheckInterval,
            AutoRestartCheckInterval);

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
            new Coverage.CoverageQueries(database),
            new Processes.BackgroundQueries(database),
            new SystemMonitor(CachedProfiles(database)),
            new DataOperations(database),
            clock,
            queue.Post,
            () => TrackerVersion.Value,
            () => TraceDatabase.CurrentSchemaVersion,
            () => startedAt,
            protection);

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
            onPause: () =>
            {
                if (settings.Current.TrackingEnabled && UnlockFromTray(protection, "pause recording"))
                {
                    SetTracking(settings, queue, clock, enabled: false);
                    protection.Record("paused", "Recording was paused from the tray icon.");
                }
            },
            onResume: () =>
            {
                SetTracking(settings, queue, clock, enabled: true);
                protection.Record("resumed", "Recording was resumed from the tray icon.");
            },
            onQuit: () =>
            {
                if (!UnlockFromTray(protection, "quit Trace"))
                {
                    return;
                }

                if (protection.Enabled)
                {
                    // Otherwise auto-restart would bring it straight back.
                    TryWriteMarker(TracePaths.QuitMarkerFile);
                    protection.SuspendAutoRestart();
                }

                protection.Record("quit", protection.Enabled
                    ? "Trace was quit from the tray icon with the PIN. It starts again when you next sign in or open Trace."
                    : "Trace was quit from the tray icon.");
                RequestQuit();
            });

        _tray = tray;
        tray.Update(engine.State, settings.Current.TrackingEnabled);

        // The tray reflects state changes from anywhere — the dashboard, the
        // tray itself, or the engine going idle — so the icon can never disagree
        // with what Trace is actually doing.
        settings.Changed += updated => tray.Update(engine.State, updated.TrackingEnabled);

        // The first time the dashboard closes, explain that recording continues.
        // Once, ever — after that the user knows, and a recurring popup from a
        // background application is its own kind of rude.
        ipc.ClientDisconnected += () =>
        {
            if (settings.Current.BackgroundNoticeShown)
            {
                return;
            }

            settings.Update(current => current with { BackgroundNoticeShown = true });
            tray.ShowBackgroundNotice();
        };

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
    /// Distinct from pausing (DOCS/specs/windows-integration.md §12): quitting stops the
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
    /// True when no PIN is set, the PIN was entered in the last few minutes,
    /// or it is entered now in the tray's PIN window.
    /// </summary>
    private static bool UnlockFromTray(ProtectionService protection, string action)
    {
        try
        {
            protection.Demand(action);
            return true;
        }
        catch (IpcException)
        {
            return Tray.PinPrompt.Ask(action, secret =>
            {
                try
                {
                    protection.Unlock(secret);
                    return null;
                }
                catch (IpcException ex)
                {
                    return ex.Message;
                }
            });
        }
    }

    /// <summary>
    /// Adds the previous run's ending to the tamper log. Returns true when the
    /// auto-restart task was switched off on purpose (an update, or a quit
    /// with the PIN), so putting it back is not news.
    /// </summary>
    private static bool RecordHowLastRunEnded(
        ProtectionService protection,
        bool previousRunCrashed,
        long? lastHeartbeat,
        bool fromWatchdog,
        bool databaseExisted,
        SettingsStore settings,
        IClock clock)
    {
        var now = clock.UtcNowMs;
        var quiet = false;
        long? from = lastHeartbeat is > 0 ? lastHeartbeat : null;

        if (TryDeleteMarker(TracePaths.UpdateMarkerFile))
        {
            quiet = true;
            protection.Record("updated", "Trace was installed or updated.", from, now);
        }
        else if (previousRunCrashed)
        {
            protection.Record(
                "unexpected-stop",
                "Trace stopped without shutting down: it was ended (for example in Task Manager), it crashed, " +
                "or the computer lost power." + (fromWatchdog ? " Auto-restart started it again." : string.Empty),
                from,
                now);
        }

        if (TryDeleteMarker(TracePaths.QuitMarkerFile))
        {
            quiet = true;
        }

        if (!databaseExisted && settings.Current.OnboardingCompleted)
        {
            protection.Record(
                "new-history",
                "Trace's history file was missing, so a new, empty one was started. Earlier history and the PIN were in it.");
        }

        return quiet;
    }

    private static bool TryDeleteMarker(string path)
    {
        try
        {
            if (!File.Exists(path))
            {
                return false;
            }

            File.Delete(path);
            return true;
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            Log.Warn($"Could not remove '{Path.GetFileName(path)}': {ex.Message}");
            return true;
        }
    }

    private static void TryWriteMarker(string path)
    {
        try
        {
            File.WriteAllText(path, DateTimeOffset.UtcNow.ToString("O"));
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            Log.Warn($"Could not write '{Path.GetFileName(path)}': {ex.Message}");
        }
    }

    /// <summary>The sandbox never touches the real scheduled task.</summary>
    private sealed class NoAutoRestart : IAutoRestart
    {
        public bool IsActive() => true;

        public void Install()
        {
        }

        public void Disable()
        {
        }

        public void Remove()
        {
        }
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

            // Processes still running will not be seen to end: say so.
            try
            {
                _processes?.Stop(DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
            }
            catch (Exception ex) when (ex is Microsoft.Data.Sqlite.SqliteException or ObjectDisposedException)
            {
                Log.Warn($"Could not close the process record: {ex.Message}");
            }

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

    /// <summary>
    /// Re-names the history in the background. Off the startup path because it
    /// reads version resources and queries the package manager, and the first
    /// thing Trace owes a user after starting is recording, not housekeeping.
    /// A failure costs only stale names, so it is logged and never fatal.
    /// </summary>
    private static void StartIdentityBackfill(TraceDatabase database) =>
        _ = Task.Run(() =>
        {
            try
            {
                var renamed = IdentityBackfill.Run(database, ProcessIdentity.Resolver);
                if (renamed > 0)
                {
                    Log.Info($"Re-resolved the names of {renamed} applications.");
                }
            }
            catch (ObjectDisposedException)
            {
                // Shutting down before it finished; it resumes next start.
            }
            catch (Exception ex) when (ex is Microsoft.Data.Sqlite.SqliteException or IOException)
            {
                Log.Error("Could not re-resolve application names.", ex);
            }
        });

    /// <summary>
    /// One import pass. Runs on a timer thread, never the engine's; a failure
    /// costs only the explanation of some gaps, so it is logged and retried at
    /// the next interval.
    /// </summary>
    private static void ImportWindowsRecords(TraceDatabase database, SettingsStore settings)
    {
        if (!settings.Current.ImportWindowsRecords)
        {
            return;
        }

        try
        {
            var added = WindowsRecordImport.Run(database, SystemLogSource.Instance);
            if (added > 0)
            {
                Log.Info($"Copied {added} Windows power and sign-in records.");
            }
        }
        catch (ObjectDisposedException)
        {
            // Shutting down.
        }
        catch (Exception ex) when (ex is Microsoft.Data.Sqlite.SqliteException or IOException)
        {
            Log.Error("Could not copy Windows records.", ex);
        }
    }

    /// <summary>Names a background process the way the foreground tracker names an app.</summary>
    private sealed class ResolverNamer : Processes.IProcessNamer
    {
        public ResolvedIdentity Resolve(string executable, string? path) => ProcessIdentity.Resolver.Resolve(executable, path);

        public int Version => ProcessIdentity.Resolver.Version;
    }

    /// <summary>
    /// Program file to application profile, for naming the System page's
    /// processes. Re-read at most every 30 seconds.
    /// </summary>
    private static Func<IReadOnlyDictionary<string, (long Id, string Name)>> CachedProfiles(TraceDatabase database)
    {
        var cache = (At: 0L, Map: (IReadOnlyDictionary<string, (long, string)>)new Dictionary<string, (long, string)>());
        var activity = new ActivityQueries(database);
        return () =>
        {
            var now = Environment.TickCount64;
            if (now - cache.At > 30_000 || cache.At == 0)
            {
                try
                {
                    cache = (now, activity.ProfilesByExecutable());
                }
                catch (Exception ex) when (ex is Microsoft.Data.Sqlite.SqliteException or ObjectDisposedException)
                {
                    Log.Debug($"Could not read application names: {ex.Message}");
                }
            }

            return cache.Map;
        };
    }
}
