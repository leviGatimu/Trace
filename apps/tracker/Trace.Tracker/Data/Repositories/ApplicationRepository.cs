using Microsoft.Data.Sqlite;
using Trace.Tracker.Engine;

namespace Trace.Tracker.Data.Repositories;

/// <summary>
/// Reads and writes <c>applications</c>.
///
/// Every method takes the caller's connection so a whole state transition —
/// application, session, window session and events — commits as one
/// transaction, and a transition is never half-recorded.
/// </summary>
internal static class ApplicationRepository
{
    /// <summary>
    /// Returns the id for this application, creating it on first sight.
    ///
    /// Chrome has one identity no matter how many times it launches
    /// (DOCS/data and database.md §3). The executable name is the key; the path
    /// is metadata, refreshed when a better one becomes available — an
    /// application seen first as an elevated process has no path, and should
    /// pick one up later rather than staying blank forever.
    /// </summary>
    public static long Upsert(SqliteConnection connection, TrackedApplication application, long atUtcMs)
    {
        using var command = connection.CreateCommand();
        command.CommandText =
            """
            INSERT INTO applications (name, executable, path, first_seen, last_seen)
            VALUES ($name, $executable, $path, $at, $at)
            ON CONFLICT(executable) DO UPDATE SET
                last_seen = $at,
                name      = excluded.name,
                path      = COALESCE(excluded.path, applications.path)
            RETURNING id;
            """;

        command.Parameters.AddWithValue("$name", application.DisplayName);
        command.Parameters.AddWithValue("$executable", application.Executable);
        command.Parameters.AddWithValue("$path", (object?)application.ExecutablePath ?? DBNull.Value);
        command.Parameters.AddWithValue("$at", atUtcMs);

        return (long)command.ExecuteScalar()!;
    }

    /// <summary>Removes applications no session refers to any more.</summary>
    public static int DeleteOrphans(SqliteConnection connection)
    {
        using var command = connection.CreateCommand();
        command.CommandText =
            """
            DELETE FROM applications
            WHERE id NOT IN (SELECT DISTINCT application_id FROM sessions);
            """;

        return command.ExecuteNonQuery();
    }
}
