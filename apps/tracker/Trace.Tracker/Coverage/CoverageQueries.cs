using Microsoft.Data.Sqlite;
using Trace.Contracts;
using Trace.Tracker.Data;

namespace Trace.Tracker.Coverage;

/// <summary>Reads what <see cref="CoverageBuilder"/> needs and builds the report.</summary>
internal sealed class CoverageQueries(TraceDatabase database)
{
    /// <summary>Longest range one request may cover; a year of segments is still small.</summary>
    private const long MaxRangeMs = 400L * 86_400_000;

    public CoverageReport Get(CoverageQuery query, long nowUtcMs)
    {
        if (query.ToUtcMs <= query.FromUtcMs || query.ToUtcMs - query.FromUtcMs > MaxRangeMs)
        {
            throw new ArgumentException("The coverage range must be positive and at most 400 days.");
        }

        return database.Read(connection =>
        {
            var spans = ReadSessions(connection, query.FromUtcMs, query.ToUtcMs);
            spans.AddRange(ReadTraceIntervals(connection, query.FromUtcMs, query.ToUtcMs));
            var records = ReadWindowsRecords(connection, query.FromUtcMs, query.ToUtcMs);
            var traceFrom = Scalar(connection, "SELECT MIN(started_at) FROM sessions;");
            var windowsFrom = Scalar(connection, "SELECT MIN(timestamp) FROM windows_records;");
            var starts = ReadTrackerStarts(connection, query.FromUtcMs, query.ToUtcMs);

            return new CoverageReport(
                query.FromUtcMs,
                query.ToUtcMs,
                traceFrom,
                windowsFrom,
                CoverageBuilder.Build(
                    query.FromUtcMs, query.ToUtcMs, nowUtcMs, spans, records, windowsFrom, traceFrom, starts));
        });
    }

    private static List<TraceSpan> ReadSessions(SqliteConnection connection, long from, long to)
    {
        using var command = connection.CreateCommand();
        command.CommandText =
            """
            SELECT id, started_at, ended_at, end_reason FROM sessions
             WHERE started_at < $to AND (ended_at IS NULL OR ended_at > $from)
             ORDER BY started_at;
            """;
        command.Parameters.AddWithValue("$from", from);
        command.Parameters.AddWithValue("$to", to);

        var spans = new List<TraceSpan>();
        using var reader = command.ExecuteReader();
        while (reader.Read())
        {
            spans.Add(new TraceSpan(
                "recorded",
                reader.GetInt64(1),
                reader.IsDBNull(2) ? null : reader.GetInt64(2),
                !reader.IsDBNull(3) && reader.GetString(3) == nameof(EndReason.CRASH_RECOVERY),
                EvidenceIds.Session(reader.GetInt64(0))));
        }

        return spans;
    }

    /// <summary>Locked, paused and asleep stretches, paired from their start and end events.</summary>
    private static List<TraceSpan> ReadTraceIntervals(SqliteConnection connection, long from, long to)
    {
        using var command = connection.CreateCommand();
        command.CommandText =
            """
            SELECT id, timestamp, type FROM (
                SELECT * FROM (
                    SELECT id, timestamp, type FROM events
                     WHERE timestamp < $from
                       AND type IN ('SYSTEM_LOCKED','SYSTEM_UNLOCKED','SYSTEM_SLEEP','SYSTEM_WAKE',
                                    'TRACKING_PAUSED','TRACKING_RESUMED','TRACKER_STARTED','TRACKER_RECOVERED')
                     ORDER BY timestamp DESC LIMIT 1)
                UNION ALL
                SELECT * FROM (
                    SELECT id, timestamp, type FROM events
                     WHERE timestamp >= $from AND timestamp < $to
                       AND type IN ('SYSTEM_LOCKED','SYSTEM_UNLOCKED','SYSTEM_SLEEP','SYSTEM_WAKE',
                                    'TRACKING_PAUSED','TRACKING_RESUMED','TRACKER_STARTED','TRACKER_RECOVERED'))
            )
            ORDER BY timestamp, id;
            """;
        command.Parameters.AddWithValue("$from", from);
        command.Parameters.AddWithValue("$to", to);

        var spans = new List<TraceSpan>();
        (string Kind, long At, long Id)? open = null;
        using var reader = command.ExecuteReader();
        while (reader.Read())
        {
            var (id, at, type) = (reader.GetInt64(0), reader.GetInt64(1), reader.GetString(2));
            var opens = type switch
            {
                nameof(EventType.SYSTEM_LOCKED) => "locked",
                nameof(EventType.SYSTEM_SLEEP) => "asleep",
                nameof(EventType.TRACKING_PAUSED) => "paused",
                _ => null,
            };

            if (opens is not null)
            {
                // Locked, then asleep: the lock interval ends where sleep begins.
                if (open is { } previous)
                {
                    spans.Add(new TraceSpan(previous.Kind, previous.At, at, false, EvidenceIds.Event(previous.Id)));
                }

                open = (opens, at, id);
                continue;
            }

            // Any other event closes the interval. A tracker start closes it too:
            // an unlock lost to a crash must not leave the PC "locked" for days.
            if (open is { } o)
            {
                var closedByRestart = type is nameof(EventType.TRACKER_STARTED) or nameof(EventType.TRACKER_RECOVERED);
                spans.Add(new TraceSpan(o.Kind, o.At, closedByRestart ? o.At : at, false, EvidenceIds.Event(o.Id)));
                open = null;
            }
        }

        if (open is { } still)
        {
            spans.Add(new TraceSpan(still.Kind, still.At, null, false, EvidenceIds.Event(still.Id)));
        }

        return spans;
    }

    private static List<TrackerStart> ReadTrackerStarts(SqliteConnection connection, long from, long to)
    {
        using var command = connection.CreateCommand();
        command.CommandText =
            """
            SELECT timestamp, id FROM events
             WHERE type IN ('TRACKER_STARTED','TRACKER_RECOVERED') AND timestamp >= $from AND timestamp <= $to
             ORDER BY timestamp, id;
            """;
        command.Parameters.AddWithValue("$from", from);
        command.Parameters.AddWithValue("$to", to);

        var starts = new List<TrackerStart>();
        using var reader = command.ExecuteReader();
        while (reader.Read())
        {
            starts.Add(new TrackerStart(reader.GetInt64(0), reader.GetInt64(1)));
        }

        return starts;
    }

    private static List<StoredWindowsRecord> ReadWindowsRecords(SqliteConnection connection, long from, long to)
    {
        using var command = connection.CreateCommand();
        command.CommandText =
            """
            SELECT id, timestamp, kind FROM windows_records
             WHERE timestamp < $to
               AND timestamp >= COALESCE((SELECT MAX(timestamp) FROM windows_records WHERE timestamp < $from), $from)
             ORDER BY timestamp, id;
            """;
        command.Parameters.AddWithValue("$from", from);
        command.Parameters.AddWithValue("$to", to);

        var records = new List<StoredWindowsRecord>();
        using var reader = command.ExecuteReader();
        while (reader.Read())
        {
            records.Add(new StoredWindowsRecord(
                reader.GetInt64(0), reader.GetInt64(1), WindowsRecordKinds.Parse(reader.GetString(2))));
        }

        return records;
    }

    private static long? Scalar(SqliteConnection connection, string sql)
    {
        using var command = connection.CreateCommand();
        command.CommandText = sql;
        return command.ExecuteScalar() is long value ? value : null;
    }
}
