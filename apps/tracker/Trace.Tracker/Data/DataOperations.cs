using System.Text;
using System.Text.Json;
using Microsoft.Data.Sqlite;
using Trace.Contracts;
using Trace.Tracker.Data.Repositories;
using Trace.Tracker.Diagnostics;

namespace Trace.Tracker.Data;

/// <summary>
/// The destructive and take-my-data-elsewhere operations: delete and export.
///
/// Privacy is not real if the user cannot remove their own history or take it
/// with them (DOCS/Privacy.md §20-22). Deletion here is a real <c>DELETE</c> —
/// the schema has no soft-delete column, so "hidden but retained" is not even
/// representable.
/// </summary>
internal sealed class DataOperations
{
    private readonly TraceDatabase _database;

    public DataOperations(TraceDatabase database)
    {
        _database = database;
    }

    public DeleteResult DeleteRange(long fromUtcMs, long toUtcMs)
    {
        if (toUtcMs <= fromUtcMs)
        {
            return new DeleteResult(0, 0, 0, 0);
        }

        var result = _database.Write(connection =>
        {
            // Window sessions and session-scoped events cascade. The separate
            // event delete catches system events — lock, sleep, pause — which
            // belong to no session and would otherwise survive a deletion the
            // user believed was complete.
            var sessions = SessionRepository.DeleteRange(connection, fromUtcMs, toUtcMs);
            var events = EventRepository.DeleteRange(connection, fromUtcMs, toUtcMs);
            var applications = ApplicationRepository.DeleteOrphans(connection);

            return new DeleteResult(sessions, 0, events, applications);
        });

        Vacuum();
        return result;
    }

    /// <summary>
    /// Removes one application's history entirely — the second half of the
    /// choice offered when an application is excluded (DOCS/Privacy.md §8).
    /// </summary>
    public DeleteResult DeleteApplication(long applicationId)
    {
        var result = _database.Write(connection =>
        {
            var sessions = SessionRepository.DeleteForApplication(connection, applicationId);

            using var command = connection.CreateCommand();
            command.CommandText = "DELETE FROM applications WHERE id = $id;";
            command.Parameters.AddWithValue("$id", applicationId);
            var applications = command.ExecuteNonQuery();

            return new DeleteResult(sessions, 0, 0, applications);
        });

        Vacuum();
        return result;
    }

    public DeleteResult DeleteEverything()
    {
        var result = _database.Write(connection =>
        {
            var counts = new Dictionary<string, int>();

            foreach (var table in new[] { "events", "window_sessions", "sessions", "applications" })
            {
                using var command = connection.CreateCommand();
                command.CommandText = $"DELETE FROM {table};";
                counts[table] = command.ExecuteNonQuery();
            }

            // tracker_state is not history; it is the tracker's own bookkeeping,
            // and clearing it would make the next start think it crashed.
            return new DeleteResult(
                counts["sessions"], counts["window_sessions"], counts["events"],
                counts["applications"]);
        });

        Vacuum();
        return result;
    }

    /// <summary>
    /// Reclaims disk after a large delete.
    ///
    /// Run outside the deleting transaction and tolerant of failure: a database
    /// that is momentarily busy is not a reason to report a successful deletion
    /// as an error. The rows are already gone either way.
    /// </summary>
    private void Vacuum()
    {
        try
        {
            _database.Write(connection =>
            {
                using var command = connection.CreateCommand();
                command.CommandText = "PRAGMA incremental_vacuum;";
                command.ExecuteNonQuery();
            });

            _database.Checkpoint();
        }
        catch (SqliteException ex)
        {
            Log.Warn("Could not reclaim space after deleting history.", ex);
        }
    }

    // -- export -------------------------------------------------------------

    /// <summary>
    /// Writes the user's history to a JSON file.
    ///
    /// JSON rather than CSV because it can carry the full event structure
    /// (DOCS/data and database.md §22), and streamed rather than serialised in
    /// one piece because a multi-year history should not have to fit in memory
    /// to be exportable.
    /// </summary>
    public ExportResult Export(string absolutePath, long? fromUtcMs, long? toUtcMs)
    {
        var from = fromUtcMs ?? long.MinValue;
        var to = toUtcMs ?? long.MaxValue;

        var sessionsExported = 0;
        var eventsExported = 0;

        using (var stream = File.Create(absolutePath))
        using (var writer = new Utf8JsonWriter(stream, new JsonWriterOptions { Indented = true }))
        {
            writer.WriteStartObject();
            writer.WriteString("product", "Trace");
            writer.WriteNumber("schemaVersion", 1);
            writer.WriteString("exportedAt", DateTimeOffset.UtcNow.ToString("O"));
            writer.WriteString("timestamps", "UTC epoch milliseconds");
            writer.WriteString("durations", "seconds");

            _database.Read<object?>(connection =>
            {
                WriteApplications(connection, writer);
                sessionsExported = WriteSessions(connection, writer, from, to);
                eventsExported = WriteEvents(connection, writer, from, to);
                return null;
            });

            writer.WriteEndObject();
            writer.Flush();
        }

        var bytes = new FileInfo(absolutePath).Length;
        Log.Info($"Exported {sessionsExported} sessions and {eventsExported} events ({bytes} bytes).");

        return new ExportResult(absolutePath, bytes, sessionsExported, eventsExported);
    }

    private static void WriteApplications(SqliteConnection connection, Utf8JsonWriter writer)
    {
        writer.WriteStartArray("applications");

        using var command = connection.CreateCommand();
        command.CommandText =
            "SELECT id, name, executable, path, first_seen, last_seen FROM applications ORDER BY id;";

        using var reader = command.ExecuteReader();
        while (reader.Read())
        {
            writer.WriteStartObject();
            writer.WriteNumber("id", reader.GetInt64(0));
            writer.WriteString("name", reader.GetString(1));
            writer.WriteString("executable", reader.GetString(2));

            if (reader.IsDBNull(3))
            {
                writer.WriteNull("path");
            }
            else
            {
                writer.WriteString("path", reader.GetString(3));
            }

            writer.WriteNumber("firstSeen", reader.GetInt64(4));
            writer.WriteNumber("lastSeen", reader.GetInt64(5));
            writer.WriteEndObject();
        }

        writer.WriteEndArray();
    }

    private static int WriteSessions(
        SqliteConnection connection, Utf8JsonWriter writer, long from, long to)
    {
        writer.WriteStartArray("sessions");
        var count = 0;

        using var command = connection.CreateCommand();
        command.CommandText =
            """
            SELECT id, application_id, started_at, ended_at, active_seconds, idle_seconds, end_reason
              FROM sessions
             WHERE started_at >= $from AND started_at < $to
             ORDER BY started_at, id;
            """;
        command.Parameters.AddWithValue("$from", from);
        command.Parameters.AddWithValue("$to", to);

        using var reader = command.ExecuteReader();
        while (reader.Read())
        {
            count++;
            var sessionId = reader.GetInt64(0);

            writer.WriteStartObject();
            writer.WriteNumber("id", sessionId);
            writer.WriteNumber("applicationId", reader.GetInt64(1));
            writer.WriteNumber("startedAt", reader.GetInt64(2));

            if (reader.IsDBNull(3))
            {
                writer.WriteNull("endedAt");
            }
            else
            {
                writer.WriteNumber("endedAt", reader.GetInt64(3));
            }

            writer.WriteNumber("activeSeconds", reader.GetInt32(4));
            writer.WriteNumber("idleSeconds", reader.GetInt32(5));

            if (reader.IsDBNull(6))
            {
                writer.WriteNull("endReason");
            }
            else
            {
                writer.WriteString("endReason", reader.GetString(6));
            }

            writer.WriteEndObject();
        }

        writer.WriteEndArray();
        reader.Close();

        WriteWindowSessions(connection, writer, from, to);
        return count;
    }

    private static void WriteWindowSessions(
        SqliteConnection connection, Utf8JsonWriter writer, long from, long to)
    {
        writer.WriteStartArray("windowSessions");

        using var command = connection.CreateCommand();
        command.CommandText =
            """
            SELECT w.id, w.session_id, w.title, w.started_at, w.ended_at, w.duration_seconds
              FROM window_sessions w JOIN sessions s ON s.id = w.session_id
             WHERE s.started_at >= $from AND s.started_at < $to
             ORDER BY w.started_at, w.id;
            """;
        command.Parameters.AddWithValue("$from", from);
        command.Parameters.AddWithValue("$to", to);

        using var reader = command.ExecuteReader();
        while (reader.Read())
        {
            writer.WriteStartObject();
            writer.WriteNumber("id", reader.GetInt64(0));
            writer.WriteNumber("sessionId", reader.GetInt64(1));

            if (reader.IsDBNull(2))
            {
                writer.WriteNull("title");
            }
            else
            {
                writer.WriteString("title", reader.GetString(2));
            }

            writer.WriteNumber("startedAt", reader.GetInt64(3));

            if (reader.IsDBNull(4))
            {
                writer.WriteNull("endedAt");
            }
            else
            {
                writer.WriteNumber("endedAt", reader.GetInt64(4));
            }

            writer.WriteNumber("durationSeconds", reader.GetInt32(5));
            writer.WriteEndObject();
        }

        writer.WriteEndArray();
    }

    private static int WriteEvents(
        SqliteConnection connection, Utf8JsonWriter writer, long from, long to)
    {
        writer.WriteStartArray("events");
        var count = 0;

        using var command = connection.CreateCommand();
        command.CommandText =
            """
            SELECT id, timestamp, type, application_id, session_id, metadata
              FROM events
             WHERE timestamp >= $from AND timestamp < $to
             ORDER BY timestamp, id;
            """;
        command.Parameters.AddWithValue("$from", from);
        command.Parameters.AddWithValue("$to", to);

        using var reader = command.ExecuteReader();
        while (reader.Read())
        {
            count++;

            writer.WriteStartObject();
            writer.WriteNumber("id", reader.GetInt64(0));
            writer.WriteNumber("timestamp", reader.GetInt64(1));
            writer.WriteString("type", reader.GetString(2));

            if (reader.IsDBNull(3))
            {
                writer.WriteNull("applicationId");
            }
            else
            {
                writer.WriteNumber("applicationId", reader.GetInt64(3));
            }

            if (reader.IsDBNull(4))
            {
                writer.WriteNull("sessionId");
            }
            else
            {
                writer.WriteNumber("sessionId", reader.GetInt64(4));
            }

            if (reader.IsDBNull(5))
            {
                writer.WriteNull("metadata");
            }
            else
            {
                writer.WriteString("metadata", reader.GetString(5));
            }

            writer.WriteEndObject();
        }

        writer.WriteEndArray();
        return count;
    }

    /// <summary>
    /// Checks an export destination before anything is written.
    ///
    /// The path arrives over IPC. Both processes run as the same user, so this
    /// is not a privilege boundary, but a caller should not be able to talk
    /// Trace into overwriting its own database with an export of it.
    /// </summary>
    public static string? ValidateExportPath(string? path)
    {
        if (string.IsNullOrWhiteSpace(path) || !Path.IsPathFullyQualified(path))
        {
            return "The export path must be an absolute path.";
        }

        var directory = Path.GetDirectoryName(Path.GetFullPath(path));
        if (directory is null || !Directory.Exists(directory))
        {
            return "The folder for the export does not exist.";
        }

        if (TracePaths.IsInsideDataDirectory(path))
        {
            return "Trace cannot export into its own data folder.";
        }

        return null;
    }

    /// <summary>Suggested filename, e.g. <c>trace-export-2026-08-09.json</c>.</summary>
    public static string SuggestedFileName(DateTimeOffset when) =>
        new StringBuilder("trace-export-").Append(when.ToString("yyyy-MM-dd")).Append(".json")
            .ToString();
}
