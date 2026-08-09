using System.Diagnostics;
using System.Text;

namespace Trace.Tracker.Diagnostics;

public enum LogLevel
{
    Debug = 0,
    Info = 1,
    Warn = 2,
    Error = 3,
}

/// <summary>
/// Rolling file log for the tracker.
///
/// A log file is a persistence path like any other. DOCS/Privacy.md §29 requires
/// that excluded applications and window titles never reach storage, and a log
/// line is storage. Two rules enforce that here:
///
///   1. Anything derived from user content must be wrapped in
///      <see cref="Redact"/>, which returns a placeholder unless the user has
///      explicitly enabled developer logging.
///   2. <see cref="LogLevel.Debug"/> is discarded entirely unless developer
///      logging is on, and developer logging is off by default.
///
/// Deliberately hand-written rather than taking a logging framework: a third-
/// party sink is one more component that could persist a window title somewhere
/// this file cannot see.
/// </summary>
public static class Log
{
    private const long MaxFileBytes = 5 * 1024 * 1024;
    private const int MaxArchivedFiles = 5;
    private const string RedactedPlaceholder = "[redacted]";

    private static readonly Lock Gate = new();
    private static string _logFile = string.Empty;
    private static bool _initialised;

    /// <summary>
    /// When false (the default) Debug records are dropped and <see cref="Redact"/>
    /// hides user content. Toggled by Settings → Advanced → Developer logs.
    /// </summary>
    public static bool DeveloperLogging { get; set; }

    public static void Initialise()
    {
        lock (Gate)
        {
            if (_initialised)
            {
                return;
            }

            TracePaths.EnsureCreated();
            _logFile = Path.Combine(TracePaths.LogDirectory, "tracker.log");
            _initialised = true;
        }

        Info($"--- Trace Tracker {TrackerVersion.Value} starting (pid {Environment.ProcessId}) ---");
    }

    public static void Debug(string message) => Write(LogLevel.Debug, message, null);

    public static void Info(string message) => Write(LogLevel.Info, message, null);

    public static void Warn(string message, Exception? error = null) =>
        Write(LogLevel.Warn, message, error);

    public static void Error(string message, Exception? error = null) =>
        Write(LogLevel.Error, message, error);

    /// <summary>
    /// Wraps user-derived content — window titles, executable names of excluded
    /// applications, export paths. Returns a placeholder unless the user turned
    /// developer logging on.
    ///
    /// Call this at every site that would otherwise interpolate user content
    /// into a log message. If you find yourself logging a raw title, that is the
    /// bug.
    /// </summary>
    public static string Redact(string? value)
    {
        if (string.IsNullOrEmpty(value))
        {
            return "[empty]";
        }

        return DeveloperLogging ? value : $"{RedactedPlaceholder}({value.Length})";
    }

    private static void Write(LogLevel level, string message, Exception? error)
    {
        if (level == LogLevel.Debug && !DeveloperLogging)
        {
            return;
        }

        var line = new StringBuilder()
            .Append(DateTimeOffset.UtcNow.ToString("yyyy-MM-dd HH:mm:ss.fff'Z'"))
            .Append(' ')
            .Append(level.ToString().ToUpperInvariant().PadRight(5))
            .Append(' ')
            .Append(message);

        if (error is not null)
        {
            line.AppendLine().Append(error);
        }

        var text = line.ToString();

        if (Debugger.IsAttached)
        {
            System.Diagnostics.Debug.WriteLine(text);
        }

        lock (Gate)
        {
            if (!_initialised)
            {
                // Logging before Initialise() means a startup failure so early
                // that a file may not be openable. Losing the line is preferable
                // to throwing from the logger.
                return;
            }

            try
            {
                RollIfNeeded();
                File.AppendAllText(_logFile, text + Environment.NewLine, Encoding.UTF8);
            }
            catch (IOException)
            {
                // A log write must never take the tracker down or interrupt a
                // state transition. Dropping the line is the correct failure.
            }
            catch (UnauthorizedAccessException)
            {
            }
        }
    }

    /// <summary>Caller must hold <see cref="Gate"/>.</summary>
    private static void RollIfNeeded()
    {
        var info = new FileInfo(_logFile);
        if (!info.Exists || info.Length < MaxFileBytes)
        {
            return;
        }

        var archive = Path.Combine(
            TracePaths.LogDirectory,
            $"tracker-{DateTimeOffset.UtcNow:yyyyMMdd-HHmmss}.log");

        File.Move(_logFile, archive, overwrite: true);

        var stale = new DirectoryInfo(TracePaths.LogDirectory)
            .GetFiles("tracker-*.log")
            .OrderByDescending(f => f.Name)
            .Skip(MaxArchivedFiles);

        foreach (var file in stale)
        {
            try
            {
                file.Delete();
            }
            catch (IOException)
            {
            }
        }
    }
}
