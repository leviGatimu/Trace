namespace Trace.Tracker.Coverage;

/// <summary>What a Windows record says happened to the machine or the session.</summary>
internal enum WindowsRecordKind
{
    Boot,
    Shutdown,

    /// <summary>
    /// Logged at boot when the previous run did not shut down cleanly (power
    /// loss, crash, held power button). When the machine went down is not in it.
    /// </summary>
    UnexpectedShutdown,

    Sleep,
    Wake,
    SignIn,
    SignOut,
}

/// <summary>
/// One record copied from a Windows event log. Windows wrote it, not Trace, and
/// it keeps the coordinates needed to find the original in Event Viewer.
/// </summary>
internal sealed record WindowsRecord(
    string Log,
    long RecordId,
    string Provider,
    int EventId,
    long TimestampUtcMs,
    WindowsRecordKind Kind);

/// <summary>Where Windows records come from. A seam, so coverage can be tested without Windows.</summary>
internal interface IWindowsRecordSource
{
    /// <summary>Records at or after <paramref name="fromUtcMs"/>, oldest first.</summary>
    IReadOnlyList<WindowsRecord> ReadSince(long fromUtcMs);
}

internal static class WindowsRecordKinds
{
    public static string ToStorage(this WindowsRecordKind kind) => kind switch
    {
        WindowsRecordKind.Boot => "BOOT",
        WindowsRecordKind.Shutdown => "SHUTDOWN",
        WindowsRecordKind.UnexpectedShutdown => "UNEXPECTED_SHUTDOWN",
        WindowsRecordKind.Sleep => "SLEEP",
        WindowsRecordKind.Wake => "WAKE",
        WindowsRecordKind.SignIn => "SIGN_IN",
        WindowsRecordKind.SignOut => "SIGN_OUT",
        _ => throw new ArgumentOutOfRangeException(nameof(kind), kind, null),
    };

    public static WindowsRecordKind Parse(string stored) => stored switch
    {
        "BOOT" => WindowsRecordKind.Boot,
        "SHUTDOWN" => WindowsRecordKind.Shutdown,
        "UNEXPECTED_SHUTDOWN" => WindowsRecordKind.UnexpectedShutdown,
        "SLEEP" => WindowsRecordKind.Sleep,
        "WAKE" => WindowsRecordKind.Wake,
        "SIGN_IN" => WindowsRecordKind.SignIn,
        "SIGN_OUT" => WindowsRecordKind.SignOut,
        _ => throw new InvalidDataException($"Unknown Windows record kind '{stored}'."),
    };
}
