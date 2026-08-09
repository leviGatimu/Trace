using Trace.Contracts;

namespace Trace.Tracker.Engine;

/// <summary>
/// How the engine learns what is on screen.
///
/// Resolution happens on the engine thread rather than inside the Win32 hook
/// callback, which must return promptly. Resolving by HWND stays correct even
/// if the foreground has moved on by then: the handle still identifies the same
/// window, so we resolve the right thing, just slightly after the fact. The
/// timestamp is stamped when the signal is produced, so timings are unaffected.
/// </summary>
internal interface IWindowResolver
{
    TrackedApplication? Resolve(IntPtr hwnd);

    string? GetTitle(IntPtr hwnd);

    /// <summary>
    /// The window in front right now. Used after unlock and after resume, where
    /// DOCS/Tracking.md §I and §J require re-reading rather than assuming the
    /// previous application is still active.
    /// </summary>
    IntPtr GetForegroundWindow();
}

/// <summary>Result of opening a session — the sink owns application identity.</summary>
internal readonly record struct OpenedSession(long SessionId, long ApplicationId);

/// <summary>
/// The engine's only route to storage.
///
/// In production this is <c>PrivacyGate</c>, which owns the repositories
/// privately. The engine therefore cannot reach a repository even by accident,
/// which is how DOCS/Privacy.md §7 ("exclusion happens BEFORE recording") is
/// enforced by the compiler rather than by discipline.
///
/// The write methods return null when the gate refuses. The engine treats that
/// as "no session exists", so a filtered application leaves no trace in memory
/// either — it never gets an id it could later write against.
/// </summary>
internal interface IActivitySink
{
    /// <summary>
    /// True when this executable must not be recorded: a user exclusion, or
    /// Trace's own binaries (DOCS/Tracking.md §Q).
    /// </summary>
    bool IsApplicationExcluded(string executable);

    /// <summary>
    /// When false, no window sessions are created at all.
    ///
    /// Storing rows with NULL titles would also satisfy the letter of
    /// DOCS/Privacy.md §28, but the principle at the top of that document is
    /// that Trace does not collect what it does not need. With titles off, the
    /// granular window history has no purpose, so it is not written.
    /// </summary>
    bool RecordWindowTitles { get; }

    OpenedSession? OpenSession(TrackedApplication application, long startedAtUtcMs);

    void CloseSession(
        long sessionId, long endedAtUtcMs, int activeSeconds, int idleSeconds, EndReason reason);

    /// <summary>
    /// Records a window session that has already finished.
    ///
    /// Window sessions are written on completion rather than opened and closed,
    /// because their lifetime is not driven by the user alone. A terminal with a
    /// spinner, a media player counting elapsed time, or a browser showing
    /// download progress all rewrite their title several times a second; writing
    /// each one immediately would add tens of thousands of meaningless rows a
    /// day. Deferring lets the engine discard the ones too short to mean
    /// anything — see <c>SessionEngine.MinWindowSessionSeconds</c>.
    /// </summary>
    void RecordWindowSession(
        long sessionId, string title, long startedAtUtcMs, long endedAtUtcMs, int durationSeconds);

    void AppendEvent(
        EventType type, long atUtcMs, long? applicationId, long? sessionId, string? metadataJson);

    void Checkpoint(TrackerStateSnapshot snapshot);
}

/// <summary>
/// Written on every heartbeat and every transition.
///
/// This is the anchor crash recovery uses: an unclean exit closes the open
/// session at <see cref="AtUtcMs"/>, which bounds over-attribution to one
/// heartbeat interval and never invents time
/// (DOCS/data and database.md §14, §28).
///
/// <see cref="ActiveSeconds"/> and <see cref="IdleSeconds"/> carry the open
/// session's accounting as of this moment. Without them, recovering an
/// interrupted session would mean attributing all of it to active or all of it
/// to idle — both fabrications. With them, a recovered session reports the real
/// split up to the last heartbeat.
/// </summary>
internal readonly record struct TrackerStateSnapshot(
    long AtUtcMs,
    TrackingState State,
    long? CurrentSessionId,
    long? CurrentApplicationId,
    string? CurrentWindowTitle,
    int ActiveSeconds,
    int IdleSeconds);
