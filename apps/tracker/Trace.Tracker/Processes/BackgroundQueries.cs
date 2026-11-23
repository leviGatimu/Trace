using Microsoft.Data.Sqlite;
using Trace.Contracts;
using Trace.Tracker.Data;

namespace Trace.Tracker.Processes;

/// <summary>
/// Background apps: every application with a process running in the range,
/// how long it ran, how much of that it was in front, and its processes.
/// </summary>
internal sealed class BackgroundQueries(TraceDatabase database)
{
    private const int MaxInstancesPerApp = 60;

    public BackgroundReport Get(BackgroundQuery query, bool enabled, long nowUtcMs)
    {
        if (query.ToUtcMs <= query.FromUtcMs)
        {
            throw new ArgumentException("The range must be positive.");
        }

        return database.Read(connection =>
        {
            var instances = ReadInstances(connection, query.FromUtcMs, query.ToUtcMs);
            var foreground = ReadForeground(connection, query.FromUtcMs, query.ToUtcMs);
            var since = Scalar(connection, "SELECT MIN(started_at) FROM process_instances;");

            var apps = instances
                .GroupBy(row => (row.ProfileId, row.ProfileName, row.Category))
                .Select(group =>
                {
                    var running = UnionSeconds(group.Select(row => (
                        Math.Max(row.Row.StartedAt, query.FromUtcMs),
                        Math.Min(EndOf(row.Row, nowUtcMs), Math.Min(query.ToUtcMs, nowUtcMs)))));
                    return new BackgroundApp(
                        group.Key.ProfileId,
                        group.Key.ProfileName,
                        group.Key.Category,
                        group.Count(),
                        group.Count(row => row.Row.EndState == "running"),
                        running,
                        Math.Min(running, foreground.GetValueOrDefault(group.Key.ProfileId)),
                        group.Min(row => row.Row.StartedAt),
                        group.Max(row => row.Row.LastSeenAt),
                        group.Select(row => row.Row).OrderByDescending(row => row.StartedAt).Take(MaxInstancesPerApp).ToList());
                })
                .OrderByDescending(app => app.RunningNow > 0)
                .ThenByDescending(app => app.RunningSeconds)
                .ToList();

            return new BackgroundReport(enabled, since, apps.Sum(app => app.RunningNow), apps);
        });
    }

    private static long EndOf(ProcessInstanceRow row, long now) =>
        row.EndedAt ?? (row.EndState == "running" ? now : row.LastSeenAt);

    private sealed record Joined(long ProfileId, string ProfileName, string? Category, ProcessInstanceRow Row);

    private static List<Joined> ReadInstances(SqliteConnection connection, long from, long to)
    {
        using var command = connection.CreateCommand();
        // The parent is the process that had the parent id when this one
        // started: the latest one with that id that started no later. A parent
        // id whose owner cannot be found stays an id, unnamed, rather than being
        // matched to whatever has that id now.
        command.CommandText =
            """
            SELECT p.id, p.name, p.category,
                   i.id, i.pid, i.parent_pid,
                   (SELECT parent.executable FROM process_instances parent
                     WHERE parent.pid = i.parent_pid AND parent.started_at <= i.started_at
                     ORDER BY parent.started_at DESC LIMIT 1),
                   i.executable, i.path, i.started_at, i.start_observed, i.ended_at, i.end_state, i.last_seen_at
              FROM process_instances i
              JOIN applications a ON a.id = i.application_id
              JOIN profiles p ON p.id = a.profile_id
             WHERE i.started_at < $to
               AND (COALESCE(i.ended_at, i.last_seen_at) >= $from OR i.end_state = 'running');
            """;
        command.Parameters.AddWithValue("$from", from);
        command.Parameters.AddWithValue("$to", to);

        var rows = new List<Joined>();
        using var reader = command.ExecuteReader();
        while (reader.Read())
        {
            rows.Add(new Joined(
                reader.GetInt64(0),
                reader.GetString(1),
                reader.IsDBNull(2) ? null : reader.GetString(2),
                new ProcessInstanceRow(
                    reader.GetInt64(3),
                    reader.GetInt64(4),
                    reader.IsDBNull(5) ? null : reader.GetInt64(5),
                    reader.IsDBNull(6) ? null : reader.GetString(6),
                    reader.GetString(7),
                    reader.IsDBNull(8) ? null : reader.GetString(8),
                    reader.GetInt64(9),
                    reader.GetInt64(10) == 1,
                    reader.IsDBNull(11) ? null : reader.GetInt64(11),
                    reader.GetString(12),
                    reader.GetInt64(13))));
        }

        return rows;
    }

    /// <summary>Seconds each profile was in front in the range, from the raw spans.</summary>
    private static Dictionary<long, int> ReadForeground(SqliteConnection connection, long from, long to)
    {
        using var command = connection.CreateCommand();
        command.CommandText =
            """
            SELECT a.profile_id, SUM(s.active_seconds + s.idle_seconds)
              FROM sessions s JOIN applications a ON a.id = s.application_id
             WHERE s.started_at >= $from AND s.started_at < $to
             GROUP BY a.profile_id;
            """;
        command.Parameters.AddWithValue("$from", from);
        command.Parameters.AddWithValue("$to", to);
        var totals = new Dictionary<long, int>();
        using var reader = command.ExecuteReader();
        while (reader.Read())
        {
            if (!reader.IsDBNull(0))
            {
                totals[reader.GetInt64(0)] = (int)reader.GetInt64(1);
            }
        }

        return totals;
    }

    /// <summary>Total seconds covered by intervals, counting overlaps once.</summary>
    internal static int UnionSeconds(IEnumerable<(long Start, long End)> intervals)
    {
        long total = 0;
        long cursor = long.MinValue;
        foreach (var (start, end) in intervals.Where(i => i.End > i.Start).OrderBy(i => i.Start))
        {
            var from = Math.Max(start, cursor);
            if (end > from)
            {
                total += end - from;
                cursor = end;
            }
        }

        return (int)(total / 1000);
    }

    private static long? Scalar(SqliteConnection connection, string sql)
    {
        using var command = connection.CreateCommand();
        command.CommandText = sql;
        return command.ExecuteScalar() is long value ? value : null;
    }
}
