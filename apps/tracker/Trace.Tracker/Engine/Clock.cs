namespace Trace.Tracker.Engine;

/// <summary>
/// Source of time for the tracker.
///
/// Every timestamp Trace records goes through here so tests can drive the
/// session engine across hours, midnight boundaries and DST transitions in
/// milliseconds. Production uses <see cref="System"/>.
///
/// Timestamps are UTC epoch milliseconds throughout (DOCS/data and database.md
/// §24). Local time exists only in the UI.
/// </summary>
internal interface IClock
{
    long UtcNowMs { get; }

    /// <summary>
    /// Milliseconds since boot. Used only for idle arithmetic, because
    /// GetLastInputInfo reports a tick count and comparing it against wall-clock
    /// time would drift whenever the system clock is adjusted.
    /// </summary>
    ulong TickCountMs { get; }
}

internal sealed class SystemClock : IClock
{
    public static readonly SystemClock Instance = new();

    private SystemClock()
    {
    }

    public long UtcNowMs => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

    public ulong TickCountMs => Windows.NativeMethods.GetTickCount64();
}
