namespace Trace.Tracker;

/// <summary>
/// A completely separate Trace, for checking a build against a copy of real
/// history without touching the real one.
///
/// Set <c>TRACE_SANDBOX</c> to a folder and the tracker keeps its database,
/// settings and logs there, listens on its own pipe, takes its own
/// single-instance lock, and never edits the Windows startup entry. The
/// installed tracker keeps running untouched beside it. The dashboard reads the
/// same variable to find the sandbox pipe.
/// </summary>
public static class TraceSandbox
{
    public const string Variable = "TRACE_SANDBOX";

    public static string? Folder { get; } =
        Environment.GetEnvironmentVariable(Variable) is { Length: > 0 } folder
            ? Path.GetFullPath(folder)
            : null;

    public static bool IsActive => Folder is not null;

    /// <summary>Appended to the pipe and mutex names so the two trackers never collide.</summary>
    public static string NameSuffix => IsActive ? ".sandbox" : string.Empty;
}
