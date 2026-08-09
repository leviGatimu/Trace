using Microsoft.Data.Sqlite;

namespace Trace.Tracker.Data.Repositories;

internal static class WindowSessionRepository
{
    /// <summary>
    /// Writes a completed window session in one statement.
    ///
    /// Window sessions are never stored open: the engine holds the window it is
    /// watching in memory and writes it only once it ends and has proven long
    /// enough to be worth keeping.
    /// </summary>
    public static void Record(
        SqliteConnection connection,
        long sessionId,
        string title,
        long startedAtUtcMs,
        long endedAtUtcMs,
        int durationSeconds)
    {
        using var command = connection.CreateCommand();
        command.CommandText =
            """
            INSERT INTO window_sessions (session_id, title, started_at, ended_at, duration_seconds)
            VALUES ($sessionId, $title, $startedAt, $endedAt, $duration);
            """;

        command.Parameters.AddWithValue("$sessionId", sessionId);
        command.Parameters.AddWithValue("$title", title);
        command.Parameters.AddWithValue("$startedAt", startedAtUtcMs);
        command.Parameters.AddWithValue("$endedAt", endedAtUtcMs);
        command.Parameters.AddWithValue("$duration", durationSeconds);

        command.ExecuteNonQuery();
    }

    /// <summary>
    /// Brings a recovered session's window sessions inside its recovered end.
    ///
    /// Recovery closes an interrupted session at the last heartbeat, but window
    /// sessions completing after that heartbeat were still written. Left alone,
    /// a session would contain windows that outlast it, and the window durations
    /// would exceed the session's own. Windows starting after the boundary are
    /// dropped; one spanning it is truncated to it.
    ///
    /// Also closes any window session left open by a database written by an
    /// earlier build, which stored them open.
    /// </summary>
    public static void ClampToSessionEnd(
        SqliteConnection connection, long sessionId, long endedAtUtcMs)
    {
        using var drop = connection.CreateCommand();
        drop.CommandText =
            "DELETE FROM window_sessions WHERE session_id = $sessionId AND started_at >= $endedAt;";
        drop.Parameters.AddWithValue("$sessionId", sessionId);
        drop.Parameters.AddWithValue("$endedAt", endedAtUtcMs);
        drop.ExecuteNonQuery();

        using var truncate = connection.CreateCommand();
        truncate.CommandText =
            """
            UPDATE window_sessions
               SET ended_at = $endedAt,
                   duration_seconds = MAX(0, ($endedAt - started_at) / 1000)
             WHERE session_id = $sessionId
               AND (ended_at IS NULL OR ended_at > $endedAt);
            """;
        truncate.Parameters.AddWithValue("$sessionId", sessionId);
        truncate.Parameters.AddWithValue("$endedAt", endedAtUtcMs);
        truncate.ExecuteNonQuery();
    }

    /// <summary>
    /// Erases every recorded title while leaving the application and session
    /// history intact. Used when the user turns window titles off and asks for
    /// the titles already collected to go too.
    /// </summary>
    public static int DeleteAll(SqliteConnection connection)
    {
        using var command = connection.CreateCommand();
        command.CommandText = "DELETE FROM window_sessions;";
        return command.ExecuteNonQuery();
    }
}
