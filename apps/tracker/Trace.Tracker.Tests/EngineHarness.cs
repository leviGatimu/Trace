using Trace.Contracts;
using Trace.Tracker.Engine;

namespace Trace.Tracker.Tests;

/// <summary>
/// A recorded application session, as the sink saw it.
/// </summary>
internal sealed class RecordedSession
{
    public required long SessionId { get; init; }

    public required long ApplicationId { get; init; }

    public required string Executable { get; init; }

    public required long StartedAt { get; init; }

    public long? EndedAt { get; set; }

    public int ActiveSeconds { get; set; }

    public int IdleSeconds { get; set; }

    public EndReason? Reason { get; set; }

    public bool IsOpen => EndedAt is null;

    public long DurationSeconds => ((EndedAt ?? StartedAt) - StartedAt) / 1000;
}

internal sealed class RecordedWindowSession
{
    public required long WindowSessionId { get; init; }

    public required long SessionId { get; init; }

    public required string Title { get; init; }

    public required long StartedAt { get; init; }

    public long? EndedAt { get; set; }

    public int DurationSeconds { get; set; }
}

internal sealed record RecordedEvent(
    EventType Type, long AtUtcMs, long? ApplicationId, long? SessionId);

/// <summary>
/// Stands in for PrivacyGate plus the repositories.
///
/// It records everything the engine tries to write, and refuses writes for
/// excluded applications exactly as the real gate will — which is what lets the
/// privacy tests assert that an excluded application leaves *no* row in *any*
/// collection, rather than merely no session.
/// </summary>
internal sealed class RecordingSink : IActivitySink
{
    private readonly Dictionary<string, long> _applicationIds = new(StringComparer.Ordinal);
    private long _nextSessionId = 1;
    private long _nextWindowSessionId = 1;
    private long _nextApplicationId = 1;

    public List<RecordedSession> Sessions { get; } = [];

    public List<RecordedWindowSession> WindowSessions { get; } = [];

    public List<RecordedEvent> Events { get; } = [];

    public List<TrackerStateSnapshot> Checkpoints { get; } = [];

    public HashSet<string> Excluded { get; } = new(StringComparer.OrdinalIgnoreCase);

    public bool RecordWindowTitles { get; set; } = true;

    public bool IsApplicationExcluded(string executable) => Excluded.Contains(executable);

    public OpenedSession? OpenSession(TrackedApplication application, long startedAtUtcMs)
    {
        // Defence in depth: the real gate refuses here too, so the engine can
        // never hold an id for something it was not allowed to record.
        if (IsApplicationExcluded(application.Executable))
        {
            return null;
        }

        if (!_applicationIds.TryGetValue(application.Executable, out var applicationId))
        {
            applicationId = _nextApplicationId++;
            _applicationIds[application.Executable] = applicationId;
        }

        var session = new RecordedSession
        {
            SessionId = _nextSessionId++,
            ApplicationId = applicationId,
            Executable = application.Executable,
            StartedAt = startedAtUtcMs,
        };

        Sessions.Add(session);
        return new OpenedSession(session.SessionId, applicationId);
    }

    public void CloseSession(
        long sessionId, long endedAtUtcMs, int activeSeconds, int idleSeconds, EndReason reason)
    {
        var session = Sessions.Single(s => s.SessionId == sessionId);
        session.EndedAt = endedAtUtcMs;
        session.ActiveSeconds = activeSeconds;
        session.IdleSeconds = idleSeconds;
        session.Reason = reason;
    }

    public long? OpenWindowSession(long sessionId, string title, long startedAtUtcMs)
    {
        var window = new RecordedWindowSession
        {
            WindowSessionId = _nextWindowSessionId++,
            SessionId = sessionId,
            Title = title,
            StartedAt = startedAtUtcMs,
        };

        WindowSessions.Add(window);
        return window.WindowSessionId;
    }

    public void CloseWindowSession(long windowSessionId, long endedAtUtcMs, int durationSeconds)
    {
        var window = WindowSessions.Single(w => w.WindowSessionId == windowSessionId);
        window.EndedAt = endedAtUtcMs;
        window.DurationSeconds = durationSeconds;
    }

    public void AppendEvent(
        EventType type, long atUtcMs, long? applicationId, long? sessionId, string? metadataJson) =>
        Events.Add(new RecordedEvent(type, atUtcMs, applicationId, sessionId));

    public void Checkpoint(TrackerStateSnapshot snapshot) => Checkpoints.Add(snapshot);

    // -- assertions helpers -------------------------------------------------

    public RecordedSession SessionFor(string executable) =>
        Sessions.Single(s => s.Executable == executable);

    public IEnumerable<RecordedSession> SessionsFor(string executable) =>
        Sessions.Where(s => s.Executable == executable);

    public IEnumerable<RecordedWindowSession> WindowsOf(RecordedSession session) =>
        WindowSessions.Where(w => w.SessionId == session.SessionId);

    public int CountOf(EventType type) => Events.Count(e => e.Type == type);
}

/// <summary>A fake desktop: windows, titles, and which one is in front.</summary>
internal sealed class ScriptedScreen : IWindowResolver
{
    private readonly Dictionary<IntPtr, ScriptedWindow> _windows = [];
    private IntPtr _foreground = IntPtr.Zero;
    private int _nextHandle = 100;

    public IntPtr Foreground => _foreground;

    public IntPtr OpenWindow(string executable, string? title, uint processId, string? displayName = null)
    {
        var handle = new IntPtr(_nextHandle++);
        _windows[handle] = new ScriptedWindow(
            new TrackedApplication(
                processId,
                executable,
                displayName ?? executable,
                $@"C:\Apps\{executable}"),
            title);

        return handle;
    }

    /// <summary>A window whose owning process cannot be identified (protected or exited).</summary>
    public IntPtr OpenUnidentifiableWindow()
    {
        var handle = new IntPtr(_nextHandle++);
        _windows[handle] = new ScriptedWindow(null, null);
        return handle;
    }

    public void Focus(IntPtr handle) => _foreground = handle;

    public void SetTitle(IntPtr handle, string? title) =>
        _windows[handle] = _windows[handle] with { Title = title };

    public TrackedApplication? Resolve(IntPtr hwnd) =>
        _windows.TryGetValue(hwnd, out var window) ? window.Application : null;

    public string? GetTitle(IntPtr hwnd) =>
        _windows.TryGetValue(hwnd, out var window) ? window.Title : null;

    public IntPtr GetForegroundWindow() => _foreground;

    private readonly record struct ScriptedWindow(TrackedApplication? Application, string? Title);
}

/// <summary>
/// Drives <see cref="SessionEngine"/> through a scripted day.
///
/// Time is explicit and controlled, so a test can cover eight hours, an idle
/// period and a lock/unlock cycle in microseconds — and can land exactly on the
/// boundaries that matter rather than approximately near them.
/// </summary>
internal sealed class EngineHarness
{
    /// <summary>An arbitrary fixed instant: 2026-08-09 08:00:00 UTC.</summary>
    public const long DayStartUtcMs = 1786377600000;

    private readonly Dictionary<string, IntPtr> _windowsByExecutable = new(StringComparer.Ordinal);
    private uint _nextProcessId = 1000;

    public EngineHarness()
    {
        Screen = new ScriptedScreen();
        Sink = new RecordingSink();
        Engine = new SessionEngine(Sink, Screen);
    }

    public ScriptedScreen Screen { get; }

    public RecordingSink Sink { get; }

    public SessionEngine Engine { get; }

    public long Now { get; private set; } = DayStartUtcMs;

    public EngineHarness Advance(TimeSpan by)
    {
        Now += (long)by.TotalMilliseconds;
        return this;
    }

    public EngineHarness AdvanceMinutes(double minutes) => Advance(TimeSpan.FromMinutes(minutes));

    public EngineHarness AdvanceSeconds(double seconds) => Advance(TimeSpan.FromSeconds(seconds));

    public EngineHarness Start(bool paused = false)
    {
        Engine.Start(Now, paused);
        return this;
    }

    /// <summary>
    /// Puts an application in front without telling the engine. Used to set up
    /// what the user will find on screen after an unlock or a wake, where the
    /// engine is required to look for itself.
    /// </summary>
    public EngineHarness PlaceInForeground(string executable, string? title = null)
    {
        var handle = HandleFor(executable, title);

        if (title is not null)
        {
            Screen.SetTitle(handle, title);
        }

        Screen.Focus(handle);
        return this;
    }

    /// <summary>Brings an application to the foreground, creating its window on first use.</summary>
    public EngineHarness Switch(string executable, string? title = null)
    {
        PlaceInForeground(executable, title);
        Engine.Handle(new ForegroundChanged(Now, Screen.Foreground));
        return this;
    }

    /// <summary>Re-delivers a foreground event for the app already in front.</summary>
    public EngineHarness RepeatForegroundEvent()
    {
        Engine.Handle(new ForegroundChanged(Now, Screen.Foreground));
        return this;
    }

    /// <summary>Changes the title in place, as a browser tab switch does.</summary>
    public EngineHarness ChangeTitle(string title)
    {
        Screen.SetTitle(Screen.Foreground, title);
        Engine.Handle(new WindowTitleChanged(Now, Screen.Foreground));
        return this;
    }

    /// <summary>Focuses a second window belonging to an application already open.</summary>
    public EngineHarness SwitchToSecondWindowOf(string executable, string title)
    {
        var handle = Screen.OpenWindow(executable, title, ProcessIdOf(executable));
        Screen.Focus(handle);
        Engine.Handle(new ForegroundChanged(Now, handle));
        return this;
    }

    public EngineHarness FocusUnidentifiableWindow()
    {
        var handle = Screen.OpenUnidentifiableWindow();
        Screen.Focus(handle);
        Engine.Handle(new ForegroundChanged(Now, handle));
        return this;
    }

    /// <summary>
    /// The user stopped interacting <paramref name="secondsAgo"/> ago and the
    /// poll has just noticed. Mirrors IdleWatcher's backdating.
    /// </summary>
    public EngineHarness GoIdle(double secondsAgo = 300)
    {
        Engine.Handle(new IdleStarted(Now, Now - (long)(secondsAgo * 1000)));
        return this;
    }

    public EngineHarness Return()
    {
        Engine.Handle(new IdleEnded(Now));
        return this;
    }

    public EngineHarness Lock()
    {
        Engine.Handle(new SessionLocked(Now));
        return this;
    }

    public EngineHarness Unlock()
    {
        Engine.Handle(new SessionUnlocked(Now));
        return this;
    }

    public EngineHarness Sleep()
    {
        Engine.Handle(new SystemSuspending(Now));
        return this;
    }

    public EngineHarness Wake()
    {
        Engine.Handle(new SystemResumed(Now));
        return this;
    }

    public EngineHarness ShutDown()
    {
        Engine.Handle(new SystemShuttingDown(Now));
        return this;
    }

    public EngineHarness Pause()
    {
        Engine.Handle(new PauseRequested(Now));
        return this;
    }

    public EngineHarness Resume()
    {
        Engine.Handle(new ResumeRequested(Now));
        return this;
    }

    public EngineHarness Beat()
    {
        Engine.Handle(new Heartbeat(Now));
        return this;
    }

    public EngineHarness ExitForegroundProcess(string executable)
    {
        Engine.Handle(new ForegroundProcessExited(Now, ProcessIdOf(executable)));
        return this;
    }

    public EngineHarness Exclude(string executable)
    {
        Sink.Excluded.Add(executable);
        Engine.Handle(new SettingsChanged(Now));
        return this;
    }

    public EngineHarness SetWindowTitlesEnabled(bool enabled)
    {
        Sink.RecordWindowTitles = enabled;
        Engine.Handle(new SettingsChanged(Now));
        return this;
    }

    private IntPtr HandleFor(string executable, string? title)
    {
        if (_windowsByExecutable.TryGetValue(executable, out var existing))
        {
            return existing;
        }

        var handle = Screen.OpenWindow(executable, title, _nextProcessId++);
        _windowsByExecutable[executable] = handle;
        return handle;
    }

    private uint ProcessIdOf(string executable) =>
        Screen.Resolve(_windowsByExecutable[executable])!.ProcessId;
}
