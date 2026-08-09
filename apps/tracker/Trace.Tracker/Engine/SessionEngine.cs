using Trace.Contracts;

namespace Trace.Tracker.Engine;

/// <summary>
/// The heart of Trace: turns Windows signals into sessions.
///
/// This is a pure state machine. It touches no Win32 API and no database — it
/// reads the screen through <see cref="IWindowResolver"/> and writes through
/// <see cref="IActivitySink"/>. Every rule in the DOCS/Tracking.md §"MVP rules"
/// table is implemented here and has a matching test, which is only possible
/// because the class can be driven by a scripted list of signals.
///
/// Exactly one thread calls <see cref="Handle"/> (the SignalQueue consumer), so
/// nothing here locks.
/// </summary>
internal sealed class SessionEngine
{
    /// <summary>
    /// A window shown for less than this is not recorded.
    ///
    /// Unlike application sessions — where DOCS/Tracking.md §F keeps the raw
    /// transitions and cleans up at display time — window titles change for
    /// reasons that have nothing to do with the user. Running the real tracker
    /// against a terminal whose title carries a progress spinner produced nine
    /// window sessions in a few seconds; over a working day that is tens of
    /// thousands of rows describing nothing anyone will ever look at.
    ///
    /// Five seconds matches the threshold §F already proposes, applied to the
    /// table that actually needed it. The cost is that a glance at a tab lasting
    /// under five seconds is not kept, which is precisely the clutter §F asks us
    /// to avoid.
    /// </summary>
    public const int MinWindowSessionSeconds = 5;

    private readonly IActivitySink _sink;
    private readonly IWindowResolver _resolver;
    private readonly TrackerState _state = new();

    /// <summary>
    /// Whether the *user* is idle, as distinct from whether the current session
    /// is accruing idle time. The two differ when a session ends and another
    /// begins while the user is still away — the new session must start idle
    /// rather than silently crediting the absence as active time.
    /// </summary>
    private bool _userIsIdle;

    public SessionEngine(IActivitySink sink, IWindowResolver resolver)
    {
        _sink = sink;
        _resolver = resolver;
    }

    public TrackingState State => _state.State;

    public long? CurrentSessionId => _state.CurrentSessionId;

    public TrackedApplication? CurrentApplication => _state.CurrentApplication;

    public string? CurrentWindowTitle => _state.CurrentWindowTitle;

    public long SessionStartedAtUtcMs => _state.SessionStartedAtUtcMs;

    /// <summary>
    /// Whether activity is being recorded. LOCKED, SUSPENDED and PAUSED all hold
    /// no session and drop every activity signal.
    /// </summary>
    private bool IsCollecting => _state.State is TrackingState.ACTIVE or TrackingState.IDLE;

    /// <summary>
    /// Begins tracking.
    ///
    /// <paramref name="startPaused"/> carries the persisted pause state forward
    /// across a reboot. DOCS/Privacy.md §27: a user who paused tracking and
    /// restarted Windows must find it still paused, or the product has lied to
    /// them.
    /// </summary>
    public void Start(long atUtcMs, bool startPaused)
    {
        _sink.AppendEvent(EventType.TRACKER_STARTED, atUtcMs, null, null, null);

        if (startPaused)
        {
            _state.State = TrackingState.PAUSED;
            _sink.AppendEvent(EventType.TRACKING_PAUSED, atUtcMs, null, null, null);
            _sink.Checkpoint(_state.Snapshot(atUtcMs));
            return;
        }

        _state.State = TrackingState.ACTIVE;
        AdoptForeground(atUtcMs);
        _sink.Checkpoint(_state.Snapshot(atUtcMs));
    }

    /// <summary>Closes the open session for a deliberate stop (quit, shutdown).</summary>
    public void Stop(long atUtcMs, EndReason reason)
    {
        CloseCurrentSession(atUtcMs, reason);
        _sink.Checkpoint(_state.Snapshot(atUtcMs));
    }

    public void Handle(Signal signal)
    {
        switch (signal)
        {
            case ForegroundChanged f:
                OnForegroundChanged(f.AtUtcMs, f.Hwnd);
                break;

            case WindowTitleChanged w:
                OnWindowTitleChanged(w.AtUtcMs, w.Hwnd);
                break;

            case ForegroundProcessExited e:
                OnForegroundProcessExited(e.AtUtcMs, e.ProcessId);
                break;

            case IdleStarted i:
                OnIdleStarted(i.SinceUtcMs);
                break;

            case IdleEnded i:
                OnIdleEnded(i.AtUtcMs);
                break;

            case SessionLocked s:
                Suspend(s.AtUtcMs, EndReason.SYSTEM_LOCK, EventType.SYSTEM_LOCKED,
                    TrackingState.LOCKED);
                break;

            case SessionUnlocked s:
                ResumeCollecting(s.AtUtcMs, EventType.SYSTEM_UNLOCKED);
                break;

            case SystemSuspending s:
                Suspend(s.AtUtcMs, EndReason.SYSTEM_SLEEP, EventType.SYSTEM_SLEEP,
                    TrackingState.SUSPENDED);
                break;

            case SystemResumed s:
                ResumeCollecting(s.AtUtcMs, EventType.SYSTEM_WAKE);
                break;

            case SystemShuttingDown s:
                Suspend(s.AtUtcMs, EndReason.SYSTEM_SHUTDOWN, EventType.SYSTEM_SHUTDOWN,
                    TrackingState.SUSPENDED);
                break;

            case PauseRequested p:
                Suspend(p.AtUtcMs, EndReason.TRACKING_PAUSED, EventType.TRACKING_PAUSED,
                    TrackingState.PAUSED);
                break;

            case ResumeRequested r:
                ResumeCollecting(r.AtUtcMs, EventType.TRACKING_RESUMED);
                break;

            case SettingsChanged c:
                OnSettingsChanged(c.AtUtcMs);
                break;

            case Heartbeat h:
                _sink.Checkpoint(_state.Snapshot(h.AtUtcMs));
                break;
        }
    }

    // -- foreground ---------------------------------------------------------

    private void OnForegroundChanged(long atUtcMs, IntPtr hwnd)
    {
        if (!IsCollecting)
        {
            return;
        }

        var application = _resolver.Resolve(hwnd);

        // Unidentifiable (a protected or already-exited process), or filtered.
        // Either way nothing may be recorded about it — not even that it was
        // seen (DOCS/Privacy.md §29). The previous session simply ends, leaving
        // an honest gap rather than a guess.
        if (application is null || _sink.IsApplicationExcluded(application.Executable))
        {
            CloseCurrentSession(atUtcMs, EndReason.APP_SWITCH);
            _state.CurrentWindow = hwnd;
            return;
        }

        _state.CurrentWindow = hwnd;

        // Same application: one continuous application session, even across
        // different windows of that application (DOCS/Tracking.md §D and §O).
        // This is also what absorbs the duplicate foreground events Windows
        // routinely emits (DOCS/data and database.md §12).
        if (_state.HasOpenSession
            && _state.CurrentApplication is { } current
            && string.Equals(current.Executable, application.Executable, StringComparison.Ordinal))
        {
            SyncWindowSession(atUtcMs, hwnd);
            return;
        }

        CloseCurrentSession(atUtcMs, EndReason.APP_SWITCH);
        OpenSession(atUtcMs, hwnd, application);
    }

    private void OpenSession(long atUtcMs, IntPtr hwnd, TrackedApplication application)
    {
        if (_sink.OpenSession(application, atUtcMs) is not { } opened)
        {
            return; // the gate refused; no id exists, so nothing can reference it
        }

        _state.OpenSession(application, opened, atUtcMs);
        _state.CurrentWindow = hwnd;
        _state.State = TrackingState.ACTIVE;

        _sink.AppendEvent(
            EventType.FOREGROUND_CHANGED, atUtcMs, opened.ApplicationId, opened.SessionId, null);
        _sink.AppendEvent(
            EventType.SESSION_STARTED, atUtcMs, opened.ApplicationId, opened.SessionId, null);

        // A session can begin while the user is still away — an application can
        // raise itself without any input. Start it idle rather than crediting
        // the absence as use.
        if (_userIsIdle)
        {
            _state.BeginIdle(atUtcMs);
            _state.State = TrackingState.IDLE;
            _sink.AppendEvent(
                EventType.IDLE_STARTED, atUtcMs, opened.ApplicationId, opened.SessionId, null);
        }

        SyncWindowSession(atUtcMs, hwnd);
    }

    private void OnForegroundProcessExited(long atUtcMs, uint processId)
    {
        if (!IsCollecting || _state.CurrentApplication?.ProcessId != processId)
        {
            return;
        }

        // DOCS/Tracking.md §P — a more precise ending than a generic switch.
        CloseCurrentSession(atUtcMs, EndReason.APP_EXIT);
    }

    // -- window sessions ----------------------------------------------------

    private void OnWindowTitleChanged(long atUtcMs, IntPtr hwnd)
    {
        if (!IsCollecting || !_state.HasOpenSession || hwnd != _state.CurrentWindow)
        {
            return;
        }

        SyncWindowSession(atUtcMs, hwnd);
    }

    /// <summary>
    /// Brings the tracked window in line with what is on screen. A title
    /// identical to the current one is a no-op, so repeated notifications for an
    /// unchanged window do nothing.
    /// </summary>
    private void SyncWindowSession(long atUtcMs, IntPtr hwnd)
    {
        if (_state.CurrentSessionId is null)
        {
            return;
        }

        // Titles disabled: nothing is held and nothing will be written. The
        // application session history is unaffected (DOCS/Privacy.md §28).
        if (!_sink.RecordWindowTitles)
        {
            _state.ClearWindow();
            return;
        }

        var title = _resolver.GetTitle(hwnd);

        if (string.Equals(title, _state.CurrentWindowTitle, StringComparison.Ordinal))
        {
            return;
        }

        CloseCurrentWindowSession(atUtcMs);

        if (title is not null)
        {
            _state.OpenWindow(title, atUtcMs);
        }
    }

    /// <summary>
    /// Finishes the window currently being watched, and writes it only if it
    /// lasted long enough to mean something.
    /// </summary>
    private void CloseCurrentWindowSession(long atUtcMs)
    {
        if (_state.CurrentWindowTitle is not { } title
            || _state.CurrentSessionId is not { } sessionId)
        {
            _state.ClearWindow();
            return;
        }

        var startedAt = _state.WindowStartedAtUtcMs;
        var durationSeconds = _state.CloseWindow(atUtcMs);
        _state.ClearWindow();

        if (durationSeconds < MinWindowSessionSeconds)
        {
            return; // churn, not history
        }

        _sink.RecordWindowSession(sessionId, title, startedAt, atUtcMs, durationSeconds);

        // The title is not duplicated into event metadata: it already lives in
        // window_sessions, and one copy is one place to delete.
        _sink.AppendEvent(
            EventType.WINDOW_CHANGED, startedAt, _state.CurrentApplicationId, sessionId, null);
    }

    // -- idle ---------------------------------------------------------------

    private void OnIdleStarted(long sinceUtcMs)
    {
        if (!IsCollecting)
        {
            return;
        }

        _userIsIdle = true;
        _state.BeginIdle(sinceUtcMs);
        _state.State = TrackingState.IDLE;

        // Timestamped when idle actually began, not when the poll noticed.
        _sink.AppendEvent(
            EventType.IDLE_STARTED, sinceUtcMs, _state.CurrentApplicationId, _state.CurrentSessionId,
            null);
    }

    private void OnIdleEnded(long atUtcMs)
    {
        if (!IsCollecting)
        {
            return;
        }

        _userIsIdle = false;
        _state.EndIdle(atUtcMs);
        _state.State = TrackingState.ACTIVE;

        _sink.AppendEvent(
            EventType.IDLE_ENDED, atUtcMs, _state.CurrentApplicationId, _state.CurrentSessionId,
            null);
    }

    // -- suspend / resume ---------------------------------------------------

    /// <summary>
    /// Lock, sleep, shutdown and pause all behave identically: close the session
    /// with an honest reason and record nothing further until collection
    /// resumes. Only the reason and the resulting state differ.
    /// </summary>
    private void Suspend(long atUtcMs, EndReason reason, EventType eventType, TrackingState newState)
    {
        if (_state.State == newState)
        {
            return; // already there; do not duplicate the event
        }

        CloseCurrentSession(atUtcMs, reason);

        _state.ForgetIdle();
        _userIsIdle = false;
        _state.State = newState;

        _sink.AppendEvent(eventType, atUtcMs, null, null, null);
        _sink.Checkpoint(_state.Snapshot(atUtcMs));
    }

    /// <summary>
    /// Unlock, wake and resume all re-read what is in front rather than assuming
    /// the application from before is still there (DOCS/Tracking.md §I, §J).
    /// </summary>
    private void ResumeCollecting(long atUtcMs, EventType eventType)
    {
        if (IsCollecting)
        {
            return; // nothing was suspended
        }

        _sink.AppendEvent(eventType, atUtcMs, null, null, null);

        _state.State = TrackingState.ACTIVE;
        _userIsIdle = false;

        AdoptForeground(atUtcMs);
        _sink.Checkpoint(_state.Snapshot(atUtcMs));
    }

    private void AdoptForeground(long atUtcMs) =>
        OnForegroundChanged(atUtcMs, _resolver.GetForegroundWindow());

    // -- settings -----------------------------------------------------------

    /// <summary>
    /// Settings take effect immediately, not at the next application switch. A
    /// user who excludes the application they are looking at expects recording
    /// to stop now (DOCS/Privacy.md §6).
    /// </summary>
    private void OnSettingsChanged(long atUtcMs)
    {
        if (!IsCollecting)
        {
            return;
        }

        if (_state.CurrentApplication is { } application
            && _sink.IsApplicationExcluded(application.Executable))
        {
            // TRACKING_PAUSED is the closest documented reason: collection was
            // switched off for this application. No new end_reason is invented,
            // because the contract's value set is shared with the UI.
            CloseCurrentSession(atUtcMs, EndReason.TRACKING_PAUSED);
            return;
        }

        if (!_sink.RecordWindowTitles)
        {
            CloseCurrentWindowSession(atUtcMs);
        }
    }

    // -- shared -------------------------------------------------------------

    private void CloseCurrentSession(long atUtcMs, EndReason reason)
    {
        if (_state.CurrentSessionId is not { } sessionId)
        {
            return;
        }

        CloseCurrentWindowSession(atUtcMs);

        var (activeSeconds, idleSeconds) = _state.CloseSession(atUtcMs);
        var applicationId = _state.CurrentApplicationId;

        _sink.CloseSession(sessionId, atUtcMs, activeSeconds, idleSeconds, reason);
        _sink.AppendEvent(EventType.SESSION_ENDED, atUtcMs, applicationId, sessionId, null);

        _state.ClearSession();
    }
}
