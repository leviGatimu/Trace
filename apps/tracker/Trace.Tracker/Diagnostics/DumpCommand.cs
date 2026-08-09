using Microsoft.Data.Sqlite;

namespace Trace.Tracker.Diagnostics;

/// <summary>
/// <c>TraceTracker.exe --dump</c> — prints the recorded history to the console.
///
/// A read-only window onto the database for development and support, until the
/// dashboard exists. It opens its own read-only connection rather than going
/// through <see cref="Data.TraceDatabase"/>, so it is safe to run while the
/// tracker is live and cannot migrate, recover or write anything.
/// </summary>
internal static class DumpCommand
{
    private const int MaxRows = 200;

    public static int Run()
    {
        ConsoleBridge.Attach();

        if (!File.Exists(TracePaths.DatabaseFile))
        {
            ConsoleBridge.WriteLine();
            ConsoleBridge.WriteLine($"No database yet at {TracePaths.DatabaseFile}");
            ConsoleBridge.WriteLine("Run TraceTracker.exe to start recording.");
            return ExitCodes.Ok;
        }

        var connectionString = new SqliteConnectionStringBuilder
        {
            DataSource = TracePaths.DatabaseFile,
            Mode = SqliteOpenMode.ReadOnly,
            Pooling = false,
        }.ToString();

        using var connection = new SqliteConnection(connectionString);
        connection.Open();

        ConsoleBridge.WriteLine();
        ConsoleBridge.WriteLine($"Trace history  -  {TracePaths.DatabaseFile}");
        ConsoleBridge.WriteLine(new string('=', 78));

        PrintApplications(connection);
        PrintSessions(connection);
        PrintSystemEvents(connection);

        ConsoleBridge.WriteLine();
        return ExitCodes.Ok;
    }

    private static void PrintApplications(SqliteConnection connection)
    {
        ConsoleBridge.WriteLine();
        ConsoleBridge.WriteLine("APPLICATIONS");
        ConsoleBridge.WriteLine(new string('-', 78));

        using var command = connection.CreateCommand();
        command.CommandText =
            """
            SELECT a.name,
                   a.executable,
                   COALESCE(SUM(s.active_seconds), 0),
                   COALESCE(SUM(s.idle_seconds), 0),
                   COUNT(s.id)
              FROM applications a
              LEFT JOIN sessions s ON s.application_id = a.id
             GROUP BY a.id
             ORDER BY 3 DESC;
            """;

        using var reader = command.ExecuteReader();
        var any = false;

        while (reader.Read())
        {
            any = true;
            ConsoleBridge.WriteLine(
                $"  {reader.GetString(0),-34} {Duration(reader.GetInt32(2)),10} active  " +
                $"{Duration(reader.GetInt32(3)),8} idle  {reader.GetInt32(4),4} sessions");
        }

        if (!any)
        {
            ConsoleBridge.WriteLine("  (nothing recorded yet)");
        }
    }

    private static void PrintSessions(SqliteConnection connection)
    {
        ConsoleBridge.WriteLine();
        ConsoleBridge.WriteLine($"SESSIONS (most recent {MaxRows})");
        ConsoleBridge.WriteLine(new string('-', 78));

        using var command = connection.CreateCommand();
        command.CommandText =
            $"""
             SELECT s.id, a.name, s.started_at, s.ended_at, s.active_seconds, s.idle_seconds,
                    s.end_reason
               FROM sessions s JOIN applications a ON a.id = s.application_id
              ORDER BY s.started_at DESC
              LIMIT {MaxRows};
             """;

        using var reader = command.ExecuteReader();
        var sessions = new List<(long Id, string Name, long StartedAt, long? EndedAt,
            int Active, int Idle, string? Reason)>();

        while (reader.Read())
        {
            sessions.Add((
                reader.GetInt64(0),
                reader.GetString(1),
                reader.GetInt64(2),
                reader.IsDBNull(3) ? null : reader.GetInt64(3),
                reader.GetInt32(4),
                reader.GetInt32(5),
                reader.IsDBNull(6) ? null : reader.GetString(6)));
        }

        if (sessions.Count == 0)
        {
            ConsoleBridge.WriteLine("  (nothing recorded yet)");
            return;
        }

        // Oldest first reads like a day, which is what the timeline will show.
        sessions.Reverse();

        foreach (var session in sessions)
        {
            var ended = session.EndedAt is { } endedAt ? LocalTime(endedAt) : "now";
            var reason = session.Reason is null ? "open" : session.Reason;

            ConsoleBridge.WriteLine(
                $"  {LocalTime(session.StartedAt)} - {ended,-8} {session.Name,-30} " +
                $"{Duration(session.Active),8} active  {Duration(session.Idle),7} idle  ({reason})");

            PrintWindowsOf(connection, session.Id);
        }
    }

    private static void PrintWindowsOf(SqliteConnection connection, long sessionId)
    {
        using var command = connection.CreateCommand();
        command.CommandText =
            """
            SELECT title, duration_seconds, ended_at
              FROM window_sessions
             WHERE session_id = $sessionId
             ORDER BY started_at;
            """;

        command.Parameters.AddWithValue("$sessionId", sessionId);

        using var reader = command.ExecuteReader();
        while (reader.Read())
        {
            var title = reader.IsDBNull(0) ? "(no title)" : reader.GetString(0);
            var duration = reader.IsDBNull(2) ? "open" : Duration(reader.GetInt32(1));

            ConsoleBridge.WriteLine($"        {duration,8}  {Truncate(title, 58)}");
        }
    }

    private static void PrintSystemEvents(SqliteConnection connection)
    {
        ConsoleBridge.WriteLine();
        ConsoleBridge.WriteLine("SYSTEM EVENTS");
        ConsoleBridge.WriteLine(new string('-', 78));

        using var command = connection.CreateCommand();
        command.CommandText =
            $"""
             SELECT timestamp, type FROM events
              WHERE session_id IS NULL
              ORDER BY timestamp DESC
              LIMIT {MaxRows};
             """;

        using var reader = command.ExecuteReader();
        var rows = new List<string>();

        while (reader.Read())
        {
            rows.Add($"  {LocalTime(reader.GetInt64(0))}  {reader.GetString(1)}");
        }

        if (rows.Count == 0)
        {
            ConsoleBridge.WriteLine("  (none)");
            return;
        }

        rows.Reverse();
        rows.ForEach(ConsoleBridge.WriteLine);
    }

    /// <summary>
    /// Timestamps are stored in UTC and shown in local time — the one place
    /// this conversion belongs (DOCS/data and database.md §24).
    /// </summary>
    private static string LocalTime(long utcMs) =>
        DateTimeOffset.FromUnixTimeMilliseconds(utcMs).ToLocalTime().ToString("MMM dd HH:mm:ss");

    private static string Duration(int seconds) =>
        seconds >= 3600
            ? $"{seconds / 3600}h {seconds % 3600 / 60:00}m"
            : seconds >= 60
                ? $"{seconds / 60}m {seconds % 60:00}s"
                : $"{seconds}s";

    private static string Truncate(string value, int max) =>
        value.Length <= max ? value : value[..(max - 1)] + "…";
}
