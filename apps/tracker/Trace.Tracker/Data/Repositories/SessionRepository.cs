using Microsoft.Data.Sqlite;
using Trace.Contracts;

namespace Trace.Tracker.Data.Repositories;

/// <summary>An unfinished session found at startup, and what is known about it.</summary>
internal readonly record struct InterruptedSession(
    long SessionId,
    long ApplicationId,
    long StartedAt,
    int ActiveSeconds,
    int IdleSeconds);

internal static class SessionRepository
{
    public static long Open(SqliteConnection connection, long applicationId, long startedAtUtcMs)
    {
        using var command = connection.CreateCommand();
        command.CommandText =
            """
            INSERT INTO sessions (application_id, started_at, ended_at, active_seconds, idle_seconds)
            VALUES ($applicationId, $startedAt, NULL, 0, 0)
            RETURNING id;
            """;

        command.Parameters.AddWithValue("$applicationId", applicationId);
        command.Parameters.AddWithValue("$startedAt", startedAtUtcMs);

        return (long)command.ExecuteScalar()!;
    }

    public static void Close(
        SqliteConnection connection,
        long sessionId,
        long endedAtUtcMs,
        int activeSeconds,
        int idleSeconds,
        EndReason reason)
    {
        using var command = connection.CreateCommand();
        command.CommandText =
            """
            UPDATE sessions
               SET ended_at = $endedAt,
                   active_seconds = $active,
                   idle_seconds = $idle,
                   end_reason = $reason
             WHERE id = $id;
            """;

        command.Parameters.AddWithValue("$endedAt", endedAtUtcMs);
        command.Parameters.AddWithValue("$active", activeSeconds);
        command.Parameters.AddWithValue("$idle", idleSeconds);
        command.Parameters.AddWithValue("$reason", reason.ToString());
        command.Parameters.AddWithValue("$id", sessionId);

        command.ExecuteNonQuery();
    }

    /// <summary>
    /// Keeps the open session's accounting current without closing it.
    ///
    /// Written on every heartbeat. This is what makes crash recovery accurate
    /// rather than a guess: the row already carries the active/idle split as of
    /// the last heartbeat, so an interrupted session can be closed with real
    /// numbers instead of attributing all of it to one or the other.
    /// </summary>
    public static void UpdateAccounting(
        SqliteConnection connection, long sessionId, int activeSeconds, int idleSeconds)
    {
        using var command = connection.CreateCommand();
        command.CommandText =
            """
            UPDATE sessions
               SET active_seconds = $active,
                   idle_seconds = $idle
             WHERE id = $id AND ended_at IS NULL;
            """;

        command.Parameters.AddWithValue("$active", activeSeconds);
        command.Parameters.AddWithValue("$idle", idleSeconds);
        command.Parameters.AddWithValue("$id", sessionId);

        command.ExecuteNonQuery();
    }

    /// <summary>
    /// Every session left open by an unclean exit. Normally at most one; more
    /// would mean a previous run failed in a way worth repairing rather than
    /// ignoring.
    /// </summary>
    public static List<InterruptedSession> FindOpen(SqliteConnection connection)
    {
        using var command = connection.CreateCommand();
        command.CommandText =
            """
            SELECT id, application_id, started_at, active_seconds, idle_seconds
              FROM sessions
             WHERE ended_at IS NULL
             ORDER BY started_at;
            """;

        var open = new List<InterruptedSession>();
        using var reader = command.ExecuteReader();

        while (reader.Read())
        {
            open.Add(new InterruptedSession(
                reader.GetInt64(0),
                reader.GetInt64(1),
                reader.GetInt64(2),
                reader.GetInt32(3),
                reader.GetInt32(4)));
        }

        return open;
    }

    /// <summary>
    /// Deletes sessions started in [from, to). Window sessions and events go
    /// with them by cascade — a real delete, never a hidden flag
    /// (DOCS/Privacy.md §21).
    /// </summary>
    public static int DeleteRange(SqliteConnection connection, long fromUtcMs, long toUtcMs)
    {
        using var command = connection.CreateCommand();
        command.CommandText =
            "DELETE FROM sessions WHERE started_at >= $from AND started_at < $to;";

        command.Parameters.AddWithValue("$from", fromUtcMs);
        command.Parameters.AddWithValue("$to", toUtcMs);

        return command.ExecuteNonQuery();
    }

    public static int DeleteForApplication(SqliteConnection connection, long applicationId)
    {
        using var command = connection.CreateCommand();
        command.CommandText = "DELETE FROM sessions WHERE application_id = $applicationId;";
        command.Parameters.AddWithValue("$applicationId", applicationId);

        return command.ExecuteNonQuery();
    }
}
