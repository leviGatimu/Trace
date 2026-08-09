using Microsoft.Data.Sqlite;
using Trace.Contracts;

namespace Trace.Tracker.Data.Repositories;

/// <summary>
/// The audit layer. Events are the source of truth; sessions are the derived
/// interpretation (DOCS/data and database.md §1), so a future correction to the
/// session logic can be replayed against the original history.
/// </summary>
internal static class EventRepository
{
    public static void Append(
        SqliteConnection connection,
        EventType type,
        long atUtcMs,
        long? applicationId,
        long? sessionId,
        string? metadataJson)
    {
        using var command = connection.CreateCommand();
        command.CommandText =
            """
            INSERT INTO events (timestamp, type, application_id, session_id, metadata)
            VALUES ($timestamp, $type, $applicationId, $sessionId, $metadata);
            """;

        command.Parameters.AddWithValue("$timestamp", atUtcMs);
        command.Parameters.AddWithValue("$type", type.ToString());
        command.Parameters.AddWithValue("$applicationId", (object?)applicationId ?? DBNull.Value);
        command.Parameters.AddWithValue("$sessionId", (object?)sessionId ?? DBNull.Value);
        command.Parameters.AddWithValue("$metadata", (object?)metadataJson ?? DBNull.Value);

        command.ExecuteNonQuery();
    }

    /// <summary>
    /// Deletes events in [from, to).
    ///
    /// Events that belong to a session are already removed by cascade when the
    /// session goes; this catches the system events — lock, sleep, pause — that
    /// belong to no session and would otherwise survive a range delete the user
    /// believed was complete.
    /// </summary>
    public static int DeleteRange(SqliteConnection connection, long fromUtcMs, long toUtcMs)
    {
        using var command = connection.CreateCommand();
        command.CommandText =
            "DELETE FROM events WHERE timestamp >= $from AND timestamp < $to;";

        command.Parameters.AddWithValue("$from", fromUtcMs);
        command.Parameters.AddWithValue("$to", toUtcMs);

        return command.ExecuteNonQuery();
    }
}
