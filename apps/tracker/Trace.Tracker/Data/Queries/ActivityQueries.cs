using Microsoft.Data.Sqlite;
using Trace.Contracts;

namespace Trace.Tracker.Data.Queries;

/// <summary>
/// The read side: every query the dashboard makes.
///
/// Two rules hold throughout.
///
/// <b>Everything goes through <see cref="SessionMerger"/>.</b> Durations,
/// session counts and timeline rows are all derived from the same merged view,
/// so no two screens can disagree about how many times you used something.
///
/// <b>Results are final.</b> The UI formats <c>8020</c> as <c>2h 14m</c> and
/// derives nothing else (DOCS/data and database.md §26). Every total, count and
/// bucket is computed here.
/// </summary>
internal sealed class ActivityQueries
{
    private readonly TraceDatabase _database;

    public ActivityQueries(TraceDatabase database)
    {
        _database = database;
    }

    // -- day ----------------------------------------------------------------

    public DayActivity GetDay(DayRange range, int minSessionSeconds, long nowUtcMs)
    {
        var merged = _database.Read(connection =>
            SessionMerger.Merge(
                ReadSessionsOverlapping(connection, range.FromUtcMs, range.ToUtcMs),
                minSessionSeconds,
                nowUtcMs));

        var applications = Summarise(merged, nowUtcMs);

        return new DayActivity(
            range,
            TotalActiveSeconds: merged.Sum(s => s.ActiveSeconds),
            TotalIdleSeconds: merged.Sum(s => s.IdleSeconds),
            ApplicationCount: applications.Count,
            SessionCount: merged.Count,
            Applications: applications,
            HourBuckets: BuildHourBuckets(merged, range, nowUtcMs));
    }

    /// <summary>
    /// Active seconds per hour, for the strip along the top of the overview.
    ///
    /// A session's active time is spread across the hours it actually spans,
    /// rather than dumped into the hour it began — otherwise a three-hour
    /// session would draw one tall bar at 09:00 and leave 10:00 and 11:00 empty,
    /// which is a picture of something that did not happen.
    ///
    /// Spreading assumes activity was evenly distributed within the session.
    /// That is an approximation, and it is confined to this one chart; every
    /// number stated as fact elsewhere comes from stored totals.
    /// </summary>
    private static List<HourBucket> BuildHourBuckets(
        List<MergedSession> sessions, DayRange range, long nowUtcMs)
    {
        const long hourMs = 3_600_000;

        var buckets = new List<HourBucket>();
        for (var start = range.FromUtcMs; start < range.ToUtcMs; start += hourMs)
        {
            buckets.Add(new HourBucket(start, 0));
        }

        if (buckets.Count == 0)
        {
            return buckets;
        }

        foreach (var session in sessions)
        {
            var sessionStart = session.StartedAt;
            var sessionEnd = session.EndedAt ?? nowUtcMs;
            var spanMs = Math.Max(1, sessionEnd - sessionStart);

            for (var index = 0; index < buckets.Count; index++)
            {
                var bucketStart = buckets[index].StartUtcMs;
                var bucketEnd = bucketStart + hourMs;

                var overlapMs = Math.Min(sessionEnd, bucketEnd) - Math.Max(sessionStart, bucketStart);
                if (overlapMs <= 0)
                {
                    continue;
                }

                var share = (double)overlapMs / spanMs;
                buckets[index] = buckets[index] with
                {
                    ActiveSeconds = buckets[index].ActiveSeconds
                                    + (int)Math.Round(session.ActiveSeconds * share),
                };
            }
        }

        return buckets;
    }

    // -- calendar -----------------------------------------------------------

    /// <summary>
    /// Totals for each supplied day.
    ///
    /// One query over the whole span, bucketed in memory, rather than a query
    /// per day: a month is 31 round trips otherwise, and the sessions have to be
    /// merged as a continuous run anyway — merging each day in isolation would
    /// split a stretch that crosses midnight into two rows and count it twice.
    ///
    /// A merged session belongs to the local day it *started* in (implementation
    /// plan §14E). Splitting its active time at the boundary would mean assuming
    /// activity was spread evenly across the session, which is inventing detail
    /// the tracker never recorded.
    /// </summary>
    public List<CalendarDay> GetCalendar(
        IReadOnlyList<long> dayStartsUtcMs, int minSessionSeconds, long nowUtcMs)
    {
        if (dayStartsUtcMs.Count == 0)
        {
            return [];
        }

        var days = dayStartsUtcMs.OrderBy(day => day).ToList();

        // The final boundary is unknown — the caller sends starts, not an end —
        // so assume the last day is as long as the one before it, falling back
        // to 24 hours for a single-day request.
        var lastLength = days.Count > 1 ? days[^1] - days[^2] : 86_400_000;
        var end = days[^1] + lastLength;

        var merged = _database.Read(connection =>
            SessionMerger.Merge(
                ReadSessionsOverlapping(connection, days[0], end), minSessionSeconds, nowUtcMs));

        var active = new int[days.Count];
        var sessions = new int[days.Count];
        var applications = new HashSet<long>[days.Count];

        for (var i = 0; i < days.Count; i++)
        {
            applications[i] = [];
        }

        foreach (var session in merged)
        {
            var index = IndexOfDay(days, session.StartedAt);
            if (index < 0)
            {
                continue;
            }

            active[index] += session.ActiveSeconds;
            sessions[index]++;
            applications[index].Add(session.ApplicationId);
        }

        return days
            .Select((start, index) =>
                new CalendarDay(start, active[index], sessions[index], applications[index].Count))
            .ToList();
    }

    /// <summary>
    /// The day a timestamp falls in, by binary search over the boundaries.
    /// Returns -1 for anything before the first day.
    /// </summary>
    private static int IndexOfDay(List<long> dayStarts, long atUtcMs)
    {
        var index = dayStarts.BinarySearch(atUtcMs);
        return index >= 0 ? index : ~index - 1;
    }

    // -- timeline -----------------------------------------------------------

    public List<TimelineEntry> GetTimeline(TimelineQuery query, long nowUtcMs)
    {
        var minSessionSeconds = SessionMerger.Normalise(query.MinSessionSeconds);

        return _database.Read(connection =>
        {
            var merged = SessionMerger.Merge(
                ReadSessionsOverlapping(connection, query.FromUtcMs, query.ToUtcMs),
                minSessionSeconds,
                nowUtcMs);

            var entries = new List<TimelineEntry>();

            foreach (var session in merged)
            {
                var (primaryTitle, windowChanges) =
                    ReadWindowSummary(connection, session.RawSessionIds);

                entries.Add(new TimelineSessionEntry(
                    session.SessionId,
                    session.ApplicationId,
                    session.ApplicationName,
                    session.Executable,
                    primaryTitle,
                    windowChanges,
                    session.StartedAt,
                    session.EndedAt,
                    session.ActiveSeconds,
                    session.IdleSeconds,
                    session.EndReason,
                    session.Merged));
            }

            entries.AddRange(
                ReadSystemIntervals(connection, query.FromUtcMs, query.ToUtcMs, nowUtcMs));

            return entries.OrderBy(e => e switch
            {
                TimelineSessionEntry s => s.StartedAt,
                TimelineSystemEntry s => s.StartedAt,
                _ => 0L,
            }).ToList();
        });
    }

    /// <summary>
    /// Locked, asleep and paused stretches, reconstructed from the event log.
    ///
    /// These are not sessions and are not stored as any — they are the gaps
    /// between them, and DOCS/data and database.md §9 is exactly why the event
    /// log exists. An interval whose closing event is missing (the machine never
    /// came back) is returned open rather than guessed shut.
    /// </summary>
    private static List<TimelineEntry> ReadSystemIntervals(
        SqliteConnection connection, long fromUtcMs, long toUtcMs, long nowUtcMs)
    {
        // The last event before the window is included too, so an interval
        // already running when the day began is not missed. Each arm of the
        // union is wrapped in its own subquery: SQLite rejects ORDER BY and
        // LIMIT inside a compound SELECT arm.
        using var command = connection.CreateCommand();
        command.CommandText =
            """
            SELECT timestamp, type FROM (
                SELECT * FROM (
                    SELECT timestamp, type FROM events
                     WHERE timestamp < $from
                       AND type IN ('SYSTEM_LOCKED','SYSTEM_UNLOCKED','SYSTEM_SLEEP','SYSTEM_WAKE',
                                    'TRACKING_PAUSED','TRACKING_RESUMED')
                     ORDER BY timestamp DESC
                     LIMIT 1
                )
                UNION ALL
                SELECT * FROM (
                    SELECT timestamp, type FROM events
                     WHERE timestamp >= $from AND timestamp < $to
                       AND type IN ('SYSTEM_LOCKED','SYSTEM_UNLOCKED','SYSTEM_SLEEP','SYSTEM_WAKE',
                                    'TRACKING_PAUSED','TRACKING_RESUMED')
                )
            )
            ORDER BY timestamp;
            """;

        command.Parameters.AddWithValue("$from", fromUtcMs);
        command.Parameters.AddWithValue("$to", toUtcMs);

        var intervals = new List<TimelineEntry>();
        string? openKind = null;
        var openedAt = 0L;

        using var reader = command.ExecuteReader();
        while (reader.Read())
        {
            var at = reader.GetInt64(0);
            var type = reader.GetString(1);

            var opens = type switch
            {
                nameof(EventType.SYSTEM_LOCKED) => "LOCKED",
                nameof(EventType.SYSTEM_SLEEP) => "ASLEEP",
                nameof(EventType.TRACKING_PAUSED) => "PAUSED",
                _ => null,
            };

            if (opens is not null)
            {
                openKind = opens;
                openedAt = at;
                continue;
            }

            if (openKind is not null)
            {
                intervals.Add(new TimelineSystemEntry(
                    openKind, Math.Max(openedAt, fromUtcMs), at));
                openKind = null;
            }
        }

        if (openKind is not null)
        {
            var stillOpen = openedAt >= nowUtcMs - 1000;
            intervals.Add(new TimelineSystemEntry(
                openKind,
                Math.Max(openedAt, fromUtcMs),
                stillOpen ? null : Math.Min(toUtcMs, nowUtcMs)));
        }

        return intervals;
    }

    // -- applications -------------------------------------------------------

    public List<ApplicationSummary> ListApplications(
        DayRange range, int minSessionSeconds, long nowUtcMs)
    {
        var merged = _database.Read(connection =>
            SessionMerger.Merge(
                ReadSessionsOverlapping(connection, range.FromUtcMs, range.ToUtcMs),
                minSessionSeconds,
                nowUtcMs));

        return Summarise(merged, nowUtcMs);
    }

    /// <summary>
    /// Rolls merged sessions up per application.
    ///
    /// <c>SessionCount</c> counts merged rows, not stored rows. This is the
    /// reason the merge has to reach every read model: counted raw, File
    /// Explorer's Alt-Tab flickers would put it among the most-used applications
    /// on the machine while contributing almost no time.
    /// </summary>
    private static List<ApplicationSummary> Summarise(
        List<MergedSession> merged, long nowUtcMs) =>
        merged
            .GroupBy(s => s.ApplicationId)
            .Select(group => new ApplicationSummary(
                group.Key,
                group.First().ApplicationName,
                group.First().Executable,
                group.Sum(s => s.ActiveSeconds),
                group.Sum(s => s.IdleSeconds),
                group.Count(),
                group.Max(s => s.EndedAt ?? nowUtcMs)))
            .OrderByDescending(a => a.ActiveSeconds)
            .ThenBy(a => a.Name, StringComparer.OrdinalIgnoreCase)
            .ToList();

    public ApplicationDetail? GetApplicationDetail(
        long applicationId, DayRange range, int minSessionSeconds, long nowUtcMs) =>
        _database.Read<ApplicationDetail?>(connection =>
        {
            using var lookup = connection.CreateCommand();
            lookup.CommandText =
                "SELECT name, executable, path, first_seen, last_seen FROM applications WHERE id = $id;";
            lookup.Parameters.AddWithValue("$id", applicationId);

            using var reader = lookup.ExecuteReader();
            if (!reader.Read())
            {
                return null;
            }

            var name = reader.GetString(0);
            var executable = reader.GetString(1);
            var path = reader.IsDBNull(2) ? null : reader.GetString(2);
            var firstSeen = reader.GetInt64(3);
            var lastSeen = reader.GetInt64(4);
            reader.Close();

            var merged = SessionMerger.Merge(
                ReadSessionsOverlapping(
                    connection, range.FromUtcMs, range.ToUtcMs, applicationId),
                minSessionSeconds,
                nowUtcMs);

            var sessions = merged
                .OrderByDescending(s => s.StartedAt)
                .Select(s => new ApplicationSessionRow(
                    s.SessionId, s.StartedAt, s.EndedAt, s.ActiveSeconds, s.IdleSeconds, s.EndReason))
                .ToList();

            return new ApplicationDetail(
                applicationId,
                name,
                executable,
                path,
                firstSeen,
                lastSeen,
                ReadUsage(connection, applicationId, minSessionSeconds, nowUtcMs),
                sessions,
                ReadWindowRollup(connection, merged.SelectMany(s => s.RawSessionIds).ToList()));
        });

    /// <summary>
    /// Usage across fixed periods.
    ///
    /// Filtering by duration reproduces the merge's effect on totals without
    /// materialising every session: coalescing groups rows together but never
    /// changes the sum, so filtering alone gives the same numbers.
    /// </summary>
    private static ApplicationUsage ReadUsage(
        SqliteConnection connection, long applicationId, int minSessionSeconds, long nowUtcMs)
    {
        var dayMs = 86_400_000L;
        var todayStart = nowUtcMs - (nowUtcMs % dayMs);

        using var command = connection.CreateCommand();
        command.CommandText =
            """
            SELECT
                COALESCE(SUM(CASE WHEN started_at >= $todayStart THEN active_seconds END), 0),
                COALESCE(SUM(CASE WHEN started_at >= $yesterdayStart AND started_at < $todayStart
                                  THEN active_seconds END), 0),
                COALESCE(SUM(CASE WHEN started_at >= $weekStart THEN active_seconds END), 0),
                COALESCE(SUM(active_seconds), 0)
              FROM sessions
             WHERE application_id = $id
               AND (ended_at IS NULL OR (ended_at - started_at) >= $minimumMs);
            """;

        command.Parameters.AddWithValue("$id", applicationId);
        command.Parameters.AddWithValue("$todayStart", todayStart);
        command.Parameters.AddWithValue("$yesterdayStart", todayStart - dayMs);
        command.Parameters.AddWithValue("$weekStart", todayStart - (6 * dayMs));
        command.Parameters.AddWithValue("$minimumMs", (long)minSessionSeconds * 1000);

        using var reader = command.ExecuteReader();
        reader.Read();

        return new ApplicationUsage(
            reader.GetInt32(0), reader.GetInt32(1), reader.GetInt32(2), reader.GetInt32(3));
    }

    // -- sessions -----------------------------------------------------------

    public SessionDetail? GetSessionDetail(long sessionId) =>
        _database.Read<SessionDetail?>(connection =>
        {
            using var command = connection.CreateCommand();
            command.CommandText =
                """
                SELECT s.id, s.application_id, a.name, a.executable, s.started_at, s.ended_at,
                       s.active_seconds, s.idle_seconds, s.end_reason
                  FROM sessions s JOIN applications a ON a.id = s.application_id
                 WHERE s.id = $id;
                """;
            command.Parameters.AddWithValue("$id", sessionId);

            using var reader = command.ExecuteReader();
            if (!reader.Read())
            {
                return null;
            }

            var detail = new SessionDetail(
                reader.GetInt64(0),
                reader.GetInt64(1),
                reader.GetString(2),
                reader.GetString(3),
                reader.GetInt64(4),
                reader.IsDBNull(5) ? null : reader.GetInt64(5),
                reader.GetInt32(6),
                reader.GetInt32(7),
                ParseEndReason(reader.IsDBNull(8) ? null : reader.GetString(8)),
                [],
                []);
            reader.Close();

            return detail with
            {
                WindowSessions = ReadWindowSessions(connection, sessionId),
                Events = ReadEvents(connection, sessionId),
            };
        });

    // -- shared readers -----------------------------------------------------

    /// <summary>
    /// Sessions overlapping [from, to), not merely starting inside it — a
    /// session running across midnight belongs to both days it touches.
    /// </summary>
    private static List<RawSession> ReadSessionsOverlapping(
        SqliteConnection connection, long fromUtcMs, long toUtcMs, long? applicationId = null)
    {
        using var command = connection.CreateCommand();
        command.CommandText =
            $"""
             SELECT s.id, s.application_id, a.name, a.executable, s.started_at, s.ended_at,
                    s.active_seconds, s.idle_seconds, s.end_reason
               FROM sessions s JOIN applications a ON a.id = s.application_id
              WHERE s.started_at < $to
                AND (s.ended_at IS NULL OR s.ended_at > $from)
                {(applicationId is null ? string.Empty : "AND s.application_id = $applicationId")}
              ORDER BY s.started_at, s.id;
             """;

        command.Parameters.AddWithValue("$from", fromUtcMs);
        command.Parameters.AddWithValue("$to", toUtcMs);

        if (applicationId is { } id)
        {
            command.Parameters.AddWithValue("$applicationId", id);
        }

        var sessions = new List<RawSession>();
        using var reader = command.ExecuteReader();

        while (reader.Read())
        {
            sessions.Add(new RawSession(
                reader.GetInt64(0),
                reader.GetInt64(1),
                reader.GetString(2),
                reader.GetString(3),
                reader.GetInt64(4),
                reader.IsDBNull(5) ? null : reader.GetInt64(5),
                reader.GetInt32(6),
                reader.GetInt32(7),
                ParseEndReason(reader.IsDBNull(8) ? null : reader.GetString(8))));
        }

        return sessions;
    }

    /// <summary>The longest-shown title in a row, and how many windows it covered.</summary>
    private static (string? PrimaryTitle, int WindowChanges) ReadWindowSummary(
        SqliteConnection connection, IReadOnlyList<long> sessionIds)
    {
        if (sessionIds.Count == 0)
        {
            return (null, 0);
        }

        using var command = connection.CreateCommand();
        command.CommandText =
            $"""
             SELECT title, SUM(duration_seconds) AS total, COUNT(*) AS changes
               FROM window_sessions
              WHERE session_id IN ({Placeholders(sessionIds.Count)}) AND title IS NOT NULL
              GROUP BY title
              ORDER BY total DESC;
             """;

        Bind(command, sessionIds);

        using var reader = command.ExecuteReader();
        string? primary = null;
        var changes = 0;

        while (reader.Read())
        {
            primary ??= reader.GetString(0);
            changes += reader.GetInt32(2);
        }

        return (primary, changes);
    }

    private static List<WindowRollupRow> ReadWindowRollup(
        SqliteConnection connection, IReadOnlyList<long> sessionIds)
    {
        if (sessionIds.Count == 0)
        {
            return [];
        }

        using var command = connection.CreateCommand();
        command.CommandText =
            $"""
             SELECT title, SUM(duration_seconds), COUNT(*)
               FROM window_sessions
              WHERE session_id IN ({Placeholders(sessionIds.Count)}) AND title IS NOT NULL
              GROUP BY title
              ORDER BY 2 DESC
              LIMIT 100;
             """;

        Bind(command, sessionIds);

        var rows = new List<WindowRollupRow>();
        using var reader = command.ExecuteReader();

        while (reader.Read())
        {
            rows.Add(new WindowRollupRow(reader.GetString(0), reader.GetInt32(1), reader.GetInt32(2)));
        }

        return rows;
    }

    private static List<WindowSessionRow> ReadWindowSessions(
        SqliteConnection connection, long sessionId)
    {
        using var command = connection.CreateCommand();
        command.CommandText =
            """
            SELECT id, title, started_at, ended_at, duration_seconds
              FROM window_sessions WHERE session_id = $id ORDER BY started_at;
            """;
        command.Parameters.AddWithValue("$id", sessionId);

        var rows = new List<WindowSessionRow>();
        using var reader = command.ExecuteReader();

        while (reader.Read())
        {
            rows.Add(new WindowSessionRow(
                reader.GetInt64(0),
                reader.IsDBNull(1) ? null : reader.GetString(1),
                reader.GetInt64(2),
                reader.IsDBNull(3) ? null : reader.GetInt64(3),
                reader.GetInt32(4)));
        }

        return rows;
    }

    private static List<EventRow> ReadEvents(SqliteConnection connection, long sessionId)
    {
        using var command = connection.CreateCommand();
        command.CommandText =
            """
            SELECT id, timestamp, type, application_id, session_id, metadata
              FROM events WHERE session_id = $id ORDER BY timestamp, id;
            """;
        command.Parameters.AddWithValue("$id", sessionId);

        var rows = new List<EventRow>();
        using var reader = command.ExecuteReader();

        while (reader.Read())
        {
            rows.Add(new EventRow(
                reader.GetInt64(0),
                reader.GetInt64(1),
                Enum.TryParse<EventType>(reader.GetString(2), out var type)
                    ? type
                    : EventType.FOREGROUND_CHANGED,
                reader.IsDBNull(3) ? null : reader.GetInt64(3),
                reader.IsDBNull(4) ? null : reader.GetInt64(4),
                reader.IsDBNull(5) ? null : System.Text.Json.JsonDocument.Parse(
                    reader.GetString(5)).RootElement.Clone()));
        }

        return rows;
    }

    private static EndReason? ParseEndReason(string? stored) =>
        stored is not null && Enum.TryParse<EndReason>(stored, out var reason) ? reason : null;

    private static string Placeholders(int count) =>
        string.Join(",", Enumerable.Range(0, count).Select(i => $"$s{i}"));

    private static void Bind(SqliteCommand command, IReadOnlyList<long> ids)
    {
        for (var i = 0; i < ids.Count; i++)
        {
            command.Parameters.AddWithValue($"$s{i}", ids[i]);
        }
    }
}
