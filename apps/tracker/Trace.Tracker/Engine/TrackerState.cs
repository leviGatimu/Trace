using Trace.Contracts;

namespace Trace.Tracker.Engine;

/// <summary>
/// The tracker's in-memory picture of right now, and the arithmetic behind
/// active versus idle time.
///
/// Accumulation happens in milliseconds and is converted to seconds only when a
/// session closes. Rounding on every transition would let a long session drift
/// by seconds; doing it once cannot.
///
/// Only <see cref="SessionEngine"/> mutates this, and the engine is driven by a
/// single consumer thread, so nothing here needs locking.
/// </summary>
internal sealed class TrackerState
{
    private long _anchorUtcMs;
    private long _activeMs;
    private long _idleMs;

    public TrackingState State { get; set; } = TrackingState.ACTIVE;

    public long? CurrentSessionId { get; private set; }

    public long? CurrentApplicationId { get; private set; }

    public TrackedApplication? CurrentApplication { get; private set; }

    public long SessionStartedAtUtcMs { get; private set; }

    public IntPtr CurrentWindow { get; set; }

    public long? CurrentWindowSessionId { get; private set; }

    public string? CurrentWindowTitle { get; private set; }

    public long WindowStartedAtUtcMs { get; private set; }

    public bool IsIdle { get; private set; }

    public bool HasOpenSession => CurrentSessionId is not null;

    // -- session ------------------------------------------------------------

    public void OpenSession(TrackedApplication application, OpenedSession opened, long atUtcMs)
    {
        CurrentApplication = application;
        CurrentSessionId = opened.SessionId;
        CurrentApplicationId = opened.ApplicationId;
        SessionStartedAtUtcMs = atUtcMs;

        _anchorUtcMs = atUtcMs;
        _activeMs = 0;
        _idleMs = 0;
        IsIdle = false;
    }

    /// <summary>
    /// Finalises a session's accounting.
    ///
    /// Seconds are derived so that <c>active + idle</c> is exactly the session's
    /// wall-clock duration: active is rounded, and idle takes the remainder.
    /// A session can therefore never claim more active time than it existed for,
    /// which is asserted in the engine tests.
    /// </summary>
    public (int ActiveSeconds, int IdleSeconds) CloseSession(long endedAtUtcMs)
    {
        Settle(endedAtUtcMs);

        var totalSeconds = (int)Math.Max(0, (endedAtUtcMs - SessionStartedAtUtcMs) / 1000);
        var activeSeconds = Math.Clamp((int)Math.Round(_activeMs / 1000.0), 0, totalSeconds);

        return (activeSeconds, totalSeconds - activeSeconds);
    }

    public void ClearSession()
    {
        CurrentSessionId = null;
        CurrentApplicationId = null;
        CurrentApplication = null;
        CurrentWindowSessionId = null;
        CurrentWindowTitle = null;
        SessionStartedAtUtcMs = 0;
        WindowStartedAtUtcMs = 0;
        _activeMs = 0;
        _idleMs = 0;
        _anchorUtcMs = 0;
        IsIdle = false;
    }

    // -- idle ---------------------------------------------------------------

    /// <summary>
    /// Marks the start of an idle period at <paramref name="sinceUtcMs"/> — the
    /// moment of the user's last input, not the moment the poll noticed.
    ///
    /// The value is clamped forward to the current anchor. It can legitimately
    /// precede the session start: a foreground change can happen without user
    /// input (an application raising itself), so the last input may be older
    /// than the session. Clamping keeps every accumulated interval non-negative.
    /// </summary>
    public void BeginIdle(long sinceUtcMs)
    {
        if (IsIdle)
        {
            return;
        }

        Settle(Math.Max(sinceUtcMs, _anchorUtcMs));
        IsIdle = true;
    }

    public void EndIdle(long atUtcMs)
    {
        if (!IsIdle)
        {
            return;
        }

        Settle(atUtcMs);
        IsIdle = false;
    }

    /// <summary>
    /// Drops idle state without settling. Used when lock, suspend or pause takes
    /// over, since those supersede idle and close the session anyway.
    /// </summary>
    public void ForgetIdle() => IsIdle = false;

    /// <summary>
    /// Moves accumulated time up to <paramref name="atUtcMs"/> and re-anchors.
    /// Time never runs backwards: an out-of-order signal contributes nothing
    /// rather than subtracting.
    /// </summary>
    private void Settle(long atUtcMs)
    {
        var elapsed = Math.Max(0, atUtcMs - _anchorUtcMs);

        if (IsIdle)
        {
            _idleMs += elapsed;
        }
        else
        {
            _activeMs += elapsed;
        }

        _anchorUtcMs = Math.Max(atUtcMs, _anchorUtcMs);
    }

    // -- window sessions ----------------------------------------------------

    public void OpenWindow(long windowSessionId, string title, long atUtcMs)
    {
        CurrentWindowSessionId = windowSessionId;
        CurrentWindowTitle = title;
        WindowStartedAtUtcMs = atUtcMs;
    }

    public int CloseWindow(long endedAtUtcMs) =>
        (int)Math.Max(0, (endedAtUtcMs - WindowStartedAtUtcMs) / 1000);

    public void ClearWindow()
    {
        CurrentWindowSessionId = null;
        CurrentWindowTitle = null;
        WindowStartedAtUtcMs = 0;
    }

    public TrackerStateSnapshot Snapshot(long atUtcMs) =>
        new(atUtcMs, State, CurrentSessionId, CurrentApplicationId, CurrentWindowTitle);
}
