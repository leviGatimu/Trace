using Trace.Contracts;
using Trace.Tracker.Data.Repositories;
using Trace.Tracker.Diagnostics;

namespace Trace.Tracker.Data;

/// <summary>
/// Closes sessions left open by a crash, a power cut, or a shutdown Trace never
/// saw.
///
/// The governing rule is DOCS/data and database.md §28: never fabricate
/// activity. A session that was open when the machine died is closed at the
/// last heartbeat — the last moment Trace can actually vouch for — not at the
/// current time, and not at some guess in between. That under-reports by at
/// most one heartbeat interval, which is the right direction to be wrong in.
/// </summary>
internal static class RecoveryService
{
    public static int RecoverInterruptedSessions(TraceDatabase database) =>
        database.Write(connection =>
        {
            var open = SessionRepository.FindOpen(connection);
            if (open.Count == 0)
            {
                return 0;
            }

            var state = TrackerStateRepository.Read(connection);

            foreach (var session in open)
            {
                // No heartbeat later than the session's own start means Trace
                // learnt nothing about it before dying. A zero-length session is
                // honest; anything else would be invented.
                var endedAt = Math.Max(session.StartedAt, state?.LastHeartbeat ?? session.StartedAt);

                // The stored split was written by the last heartbeat, so it is
                // real. Clamping keeps active + idle exactly the duration even if
                // the heartbeat and the accounting disagree by a rounding second.
                var totalSeconds = (int)Math.Max(0, (endedAt - session.StartedAt) / 1000);
                var activeSeconds = Math.Clamp(session.ActiveSeconds, 0, totalSeconds);
                var idleSeconds = totalSeconds - activeSeconds;

                WindowSessionRepository.ClampToSessionEnd(connection, session.SessionId, endedAt);

                SessionRepository.Close(
                    connection,
                    session.SessionId,
                    endedAt,
                    activeSeconds,
                    idleSeconds,
                    EndReason.CRASH_RECOVERY);

                EventRepository.Append(
                    connection,
                    EventType.TRACKER_RECOVERED,
                    endedAt,
                    session.ApplicationId,
                    session.SessionId,
                    $$"""{"recoveredAt":{{endedAt}},"lastHeartbeat":{{state?.LastHeartbeat ?? 0}}}""");

                Log.Info(
                    $"Recovered interrupted session {session.SessionId}: closed at the last " +
                    $"heartbeat ({totalSeconds}s, {activeSeconds}s active).");
            }

            return open.Count;
        });

}

/// <summary>
/// A file that exists only while the tracker is running.
///
/// Whether to run an integrity check has to be decided *before* the database is
/// opened, so it cannot be answered from a table inside it. A marker on disk
/// answers it without reading a single page: present at startup means the last
/// run did not get to shut down.
/// </summary>
internal static class RunMarker
{
    /// <summary>Claims the marker and reports whether the previous run ended uncleanly.</summary>
    public static bool ClaimAndCheckPreviousRun(string path)
    {
        var previousRunCrashed = File.Exists(path);

        try
        {
            File.WriteAllText(path, DateTimeOffset.UtcNow.ToString("O"));
        }
        catch (IOException ex)
        {
            // Worst case we run an integrity check we did not need, or skip one
            // we did. Neither is worth refusing to start over.
            Log.Warn("Could not write the run marker.", ex);
        }

        return previousRunCrashed;
    }

    public static void Release(string path)
    {
        try
        {
            File.Delete(path);
        }
        catch (IOException ex)
        {
            Log.Warn("Could not clear the run marker; the next start will verify integrity.", ex);
        }
    }
}
