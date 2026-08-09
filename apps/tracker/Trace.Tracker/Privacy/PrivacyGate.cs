using Microsoft.Data.Sqlite;
using Trace.Contracts;
using Trace.Tracker.Data;
using Trace.Tracker.Data.Repositories;
using Trace.Tracker.Diagnostics;
using Trace.Tracker.Engine;
using Trace.Tracker.Settings;

namespace Trace.Tracker.Privacy;

/// <summary>
/// The only route from the session engine to storage.
///
/// DOCS/Privacy.md §7 and §29 require that excluded activity never enters the
/// database — not that it be recorded and hidden afterwards. That is structural
/// here: the engine holds an <see cref="IActivitySink"/> and no repository, so
/// every write it can possibly make passes through this class first.
///
/// <b>What is gated, and what is not.</b> Creating a record about activity is
/// gated. Finishing a record that already exists is not — a session opened
/// legitimately must still be closed when the user pauses, or it would stay
/// open forever and be recovered as a crash on the next start. So:
///
///   OpenSession, OpenWindowSession   -> refused when paused, excluded, or
///                                       (for titles) switched off
///   CloseSession, CloseWindowSession -> always allowed
///   AppendEvent, Checkpoint          -> always allowed; neither carries a
///                                       window title or the name of an
///                                       application that was never recorded
///
/// </summary>
internal sealed class PrivacyGate : IActivitySink
{
    /// <summary>
    /// Trace never appears in its own history (DOCS/Tracking.md §Q). Built in,
    /// not a default the user could remove: an activity recorder padding its own
    /// usage figures would be absurd.
    /// </summary>
    private static readonly string[] TraceOwnBinaries = ["tracetracker.exe", "trace.exe"];

    private readonly TraceDatabase _database;
    private readonly SettingsStore _settings;

    public PrivacyGate(TraceDatabase database, SettingsStore settings)
    {
        _database = database;
        _settings = settings;
    }

    /// <summary>
    /// Raised the first time a database write fails. The tracker stops writing
    /// and reports DEGRADED rather than continuing from a state it cannot vouch
    /// for.
    /// </summary>
    public event Action<string>? Degraded;

    public bool IsDegraded { get; private set; }

    public bool RecordWindowTitles => _settings.Current.RecordWindowTitles && !IsDegraded;

    private bool IsPaused => !_settings.Current.TrackingEnabled;

    public bool IsApplicationExcluded(string executable)
    {
        if (TraceOwnBinaries.Contains(executable, StringComparer.OrdinalIgnoreCase))
        {
            return true;
        }

        return _settings.Current.ExcludedExecutables
            .Contains(executable, StringComparer.OrdinalIgnoreCase);
    }

    public OpenedSession? OpenSession(TrackedApplication application, long startedAtUtcMs)
    {
        // Checked again here rather than trusting the engine. This is the
        // boundary the privacy promise is made at, so it is the boundary that
        // enforces it.
        if (IsPaused || IsDegraded || IsApplicationExcluded(application.Executable))
        {
            return null;
        }

        return Guard<OpenedSession?>(null, connection =>
        {
            // Deliberately inside the refusal check above: an excluded
            // application does not even acquire a row in `applications`.
            var applicationId = ApplicationRepository.Upsert(connection, application, startedAtUtcMs);
            var sessionId = SessionRepository.Open(connection, applicationId, startedAtUtcMs);

            return new OpenedSession(sessionId, applicationId);
        });
    }

    public void CloseSession(
        long sessionId, long endedAtUtcMs, int activeSeconds, int idleSeconds, EndReason reason) =>
        Guard(connection =>
            SessionRepository.Close(
                connection, sessionId, endedAtUtcMs, activeSeconds, idleSeconds, reason));

    public void RecordWindowSession(
        long sessionId, string title, long startedAtUtcMs, long endedAtUtcMs, int durationSeconds)
    {
        // Checked at write time, not at the time the window was first seen: a
        // user who turns titles off part-way through expects the title they were
        // looking at not to be written, and this is where that is decided.
        if (IsPaused || IsDegraded || !_settings.Current.RecordWindowTitles)
        {
            return;
        }

        Guard(connection => WindowSessionRepository.Record(
            connection, sessionId, title, startedAtUtcMs, endedAtUtcMs, durationSeconds));
    }

    public void AppendEvent(
        EventType type, long atUtcMs, long? applicationId, long? sessionId, string? metadataJson) =>
        Guard(connection =>
            EventRepository.Append(connection, type, atUtcMs, applicationId, sessionId, metadataJson));

    public void Checkpoint(TrackerStateSnapshot snapshot) =>
        Guard(connection =>
        {
            TrackerStateRepository.Write(connection, snapshot);

            // Keep the open session's accounting current, so an unclean exit can
            // be recovered with the real active/idle split rather than a guess.
            if (snapshot.CurrentSessionId is { } sessionId)
            {
                SessionRepository.UpdateAccounting(
                    connection, sessionId, snapshot.ActiveSeconds, snapshot.IdleSeconds);
            }
        });

    // -- failure handling ---------------------------------------------------

    private void Guard(Action<SqliteConnection> work) =>
        Guard<object?>(null, connection =>
        {
            work(connection);
            return null;
        });

    /// <summary>
    /// Runs a write, and on failure enters DEGRADED instead of throwing into the
    /// engine.
    ///
    /// A signal-processing thread that throws would lose every later transition.
    /// Stopping writes and telling the user is the honest failure: Trace would
    /// rather record nothing than record something it cannot stand behind.
    /// </summary>
    private T Guard<T>(T fallback, Func<SqliteConnection, T> work)
    {
        if (IsDegraded)
        {
            return fallback;
        }

        try
        {
            return _database.Write(work);
        }
        catch (Exception ex) when (ex is SqliteException or TraceDatabaseException or IOException)
        {
            IsDegraded = true;

            var message = "Trace has stopped recording because its database is unavailable.";
            Log.Error(message, ex);
            Degraded?.Invoke(message);

            return fallback;
        }
    }
}
