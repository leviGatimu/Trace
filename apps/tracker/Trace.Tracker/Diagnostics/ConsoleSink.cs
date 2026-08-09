using Trace.Contracts;
using Trace.Tracker.Engine;

namespace Trace.Tracker.Diagnostics;

/// <summary>
/// An <see cref="IActivitySink"/> that prints instead of persisting.
///
/// It lets <c>--diagnose</c> run the real <see cref="SessionEngine"/> against
/// the real desktop and show the sessions it would record — the derived history,
/// not just the raw Windows events — while touching no database and no file.
///
/// Ids are handed out in memory and mean nothing outside the run.
/// </summary>
internal sealed class ConsoleSink : IActivitySink
{
    private readonly Dictionary<string, long> _applicationIds = new(StringComparer.Ordinal);
    private readonly Dictionary<long, string> _sessionLabels = [];
    private readonly Dictionary<long, string> _windowTitles = [];
    private readonly long _startedAtUtcMs;

    private long _nextApplicationId = 1;
    private long _nextSessionId = 1;
    private long _nextWindowSessionId = 1;

    public ConsoleSink(long startedAtUtcMs, IReadOnlySet<string> excluded, bool recordWindowTitles)
    {
        _startedAtUtcMs = startedAtUtcMs;
        Excluded = excluded;
        RecordWindowTitles = recordWindowTitles;
    }

    public IReadOnlySet<string> Excluded { get; }

    public bool RecordWindowTitles { get; }

    public bool IsApplicationExcluded(string executable) => Excluded.Contains(executable);

    public OpenedSession? OpenSession(TrackedApplication application, long startedAtUtcMs)
    {
        if (IsApplicationExcluded(application.Executable))
        {
            return null;
        }

        if (!_applicationIds.TryGetValue(application.Executable, out var applicationId))
        {
            applicationId = _nextApplicationId++;
            _applicationIds[application.Executable] = applicationId;
        }

        var sessionId = _nextSessionId++;
        _sessionLabels[sessionId] = application.DisplayName;

        Write(startedAtUtcMs, $"SESSION  + #{sessionId} {application.DisplayName} [{application.Executable}]");
        return new OpenedSession(sessionId, applicationId);
    }

    public void CloseSession(
        long sessionId, long endedAtUtcMs, int activeSeconds, int idleSeconds, EndReason reason)
    {
        var label = _sessionLabels.GetValueOrDefault(sessionId, "?");
        Write(endedAtUtcMs,
            $"SESSION  - #{sessionId} {label}  active {Format(activeSeconds)}, " +
            $"idle {Format(idleSeconds)}  ({reason})");
    }

    public long? OpenWindowSession(long sessionId, string title, long startedAtUtcMs)
    {
        var windowSessionId = _nextWindowSessionId++;
        _windowTitles[windowSessionId] = title;

        Write(startedAtUtcMs, $"  WINDOW + \"{title}\"");
        return windowSessionId;
    }

    public void CloseWindowSession(long windowSessionId, long endedAtUtcMs, int durationSeconds)
    {
        var title = _windowTitles.GetValueOrDefault(windowSessionId, "?");
        Write(endedAtUtcMs, $"  WINDOW - \"{title}\"  {Format(durationSeconds)}");
    }

    public void AppendEvent(
        EventType type, long atUtcMs, long? applicationId, long? sessionId, string? metadataJson)
    {
        // Session start/end are already reported above; printing them again
        // would double every transition.
        if (type is EventType.SESSION_STARTED or EventType.SESSION_ENDED
            or EventType.FOREGROUND_CHANGED or EventType.WINDOW_CHANGED)
        {
            return;
        }

        Write(atUtcMs, $"EVENT      {type}");
    }

    public void Checkpoint(TrackerStateSnapshot snapshot)
    {
        // Heartbeats are noise in a diagnostic trace; the state line printed by
        // the status timer already shows what a checkpoint would contain.
    }

    private void Write(long atUtcMs, string text)
    {
        var elapsed = TimeSpan.FromMilliseconds(atUtcMs - _startedAtUtcMs);
        ConsoleBridge.WriteLine($"[{elapsed:hh\\:mm\\:ss}] {text}");
    }

    private static string Format(int seconds) =>
        seconds >= 3600
            ? $"{seconds / 3600}h {seconds % 3600 / 60:00}m"
            : seconds >= 60
                ? $"{seconds / 60}m {seconds % 60:00}s"
                : $"{seconds}s";
}
