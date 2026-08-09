using Microsoft.Data.Sqlite;
using Trace.Contracts;
using Trace.Tracker.Engine;

namespace Trace.Tracker.Data.Repositories;

/// <summary>
/// What the tracker was doing at the last checkpoint. Absent on a first run.
/// </summary>
internal readonly record struct PersistedTrackerState(
    long LastHeartbeat,
    long? CurrentSessionId,
    long? CurrentApplicationId,
    string? CurrentWindow,
    TrackingState State);

/// <summary>
/// The single-row <c>tracker_state</c> table (DOCS/data and database.md §15).
///
/// Its only job is to survive an interruption. Everything else about a session
/// lives in <c>sessions</c>; this row exists so the next startup can tell what
/// was in flight and when it was last known good.
/// </summary>
internal static class TrackerStateRepository
{
    public static void Write(SqliteConnection connection, TrackerStateSnapshot snapshot)
    {
        using var command = connection.CreateCommand();
        command.CommandText =
            """
            INSERT INTO tracker_state
                (id, last_heartbeat, current_session_id, current_application_id, current_window, state)
            VALUES (1, $heartbeat, $sessionId, $applicationId, $window, $state)
            ON CONFLICT(id) DO UPDATE SET
                last_heartbeat = excluded.last_heartbeat,
                current_session_id = excluded.current_session_id,
                current_application_id = excluded.current_application_id,
                current_window = excluded.current_window,
                state = excluded.state;
            """;

        command.Parameters.AddWithValue("$heartbeat", snapshot.AtUtcMs);
        command.Parameters.AddWithValue(
            "$sessionId", (object?)snapshot.CurrentSessionId ?? DBNull.Value);
        command.Parameters.AddWithValue(
            "$applicationId", (object?)snapshot.CurrentApplicationId ?? DBNull.Value);
        command.Parameters.AddWithValue(
            "$window", (object?)snapshot.CurrentWindowTitle ?? DBNull.Value);
        command.Parameters.AddWithValue("$state", snapshot.State.ToString());

        command.ExecuteNonQuery();
    }

    public static PersistedTrackerState? Read(SqliteConnection connection)
    {
        using var command = connection.CreateCommand();
        command.CommandText =
            """
            SELECT last_heartbeat, current_session_id, current_application_id, current_window, state
              FROM tracker_state
             WHERE id = 1;
            """;

        using var reader = command.ExecuteReader();
        if (!reader.Read())
        {
            return null;
        }

        return new PersistedTrackerState(
            reader.GetInt64(0),
            reader.IsDBNull(1) ? null : reader.GetInt64(1),
            reader.IsDBNull(2) ? null : reader.GetInt64(2),
            reader.IsDBNull(3) ? null : reader.GetString(3),
            Enum.TryParse<TrackingState>(reader.GetString(4), out var state)
                ? state
                : TrackingState.ACTIVE);
    }
}
