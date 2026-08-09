namespace Trace.Tracker.Engine;

/// <summary>
/// Everything that can reach the session engine, expressed as plain data.
///
/// Win32 callbacks arrive on several different threads: the WinEvent hook
/// thread, the hidden message window's thread, the idle poll timer, process-exit
/// callbacks, and IPC worker threads. Each of them does exactly one thing —
/// build one of these records and push it onto the queue. A single consumer
/// thread then runs the state machine.
///
/// Two consequences, both deliberate:
///   * the engine is single-threaded by construction, so it needs no locks and
///     transitions can never interleave;
///   * the engine can be driven entirely by a scripted list of signals, which is
///     how the DOCS/Tracking.md rules table is unit-tested without Windows.
///
/// <c>AtUtcMs</c> is stamped by the producer, not the consumer, so queue latency
/// can never shift a recorded timestamp.
/// </summary>
internal abstract record Signal(long AtUtcMs);

// --- Activity -------------------------------------------------------------

/// <summary>The foreground window changed. <paramref name="Hwnd"/> may already be stale.</summary>
internal sealed record ForegroundChanged(long AtUtcMs, IntPtr Hwnd) : Signal(AtUtcMs);

/// <summary>
/// The title of the current foreground window changed without the window
/// changing — a browser tab switch, an editor changing file. Drives window
/// sessions (DOCS/Tracking.md §D).
/// </summary>
internal sealed record WindowTitleChanged(long AtUtcMs, IntPtr Hwnd) : Signal(AtUtcMs);

/// <summary>The process owning the tracked foreground window exited.</summary>
internal sealed record ForegroundProcessExited(long AtUtcMs, uint ProcessId) : Signal(AtUtcMs);

// --- Idle -----------------------------------------------------------------

/// <summary>
/// The idle threshold has been crossed.
///
/// <paramref name="SinceUtcMs"/> is the moment of the user's last actual input,
/// not the moment the poll noticed. Idle must be backdated: recording it from
/// detection time would credit every idle period with a full threshold's worth
/// of fabricated active time, which DOCS/data and database.md §28 forbids.
/// </summary>
internal sealed record IdleStarted(long AtUtcMs, long SinceUtcMs) : Signal(AtUtcMs);

internal sealed record IdleEnded(long AtUtcMs) : Signal(AtUtcMs);

// --- System ---------------------------------------------------------------

internal sealed record SessionLocked(long AtUtcMs) : Signal(AtUtcMs);

internal sealed record SessionUnlocked(long AtUtcMs) : Signal(AtUtcMs);

internal sealed record SystemSuspending(long AtUtcMs) : Signal(AtUtcMs);

internal sealed record SystemResumed(long AtUtcMs) : Signal(AtUtcMs);

/// <summary>
/// Windows is ending the session. The engine must close the open session and
/// checkpoint before returning — this is the only chance to record a clean
/// SYSTEM_SHUTDOWN instead of recovering as CRASH_RECOVERY on next boot.
/// </summary>
internal sealed record SystemShuttingDown(long AtUtcMs) : Signal(AtUtcMs);

// --- Control --------------------------------------------------------------

internal sealed record PauseRequested(long AtUtcMs) : Signal(AtUtcMs);

internal sealed record ResumeRequested(long AtUtcMs) : Signal(AtUtcMs);

internal sealed record SettingsChanged(long AtUtcMs) : Signal(AtUtcMs);

/// <summary>
/// Periodic checkpoint. Persists tracker_state so an unclean exit can be
/// recovered to a known-good boundary, bounding over-attribution to one
/// heartbeat interval (DOCS/data and database.md §14).
/// </summary>
internal sealed record Heartbeat(long AtUtcMs) : Signal(AtUtcMs);

/// <summary>Graceful stop requested by the user ("Quit Trace") or by the host.</summary>
internal sealed record StopRequested(long AtUtcMs) : Signal(AtUtcMs);
