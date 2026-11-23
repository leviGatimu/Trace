using Microsoft.Data.Sqlite;
using Trace.Tracker.Data;

namespace Trace.Tracker.Coverage;

/// <summary>
/// Copies new Windows records into <c>windows_records</c>.
///
/// Incremental: each run reads from a little before the point the last run
/// reached (kept in <c>import_state</c>), and the unique index makes the overlap
/// harmless. The watermark is not the newest copied record, so records the user
/// deletes are not copied back in from Windows' log. The first run copies
/// everything the System log still holds, which is the point. Windows rotates the
/// log, so what is not copied now is gone.
/// </summary>
internal static class WindowsRecordImport
{
    private const string Source = "windows:System";

    /// <summary>Re-read this far back, in case Windows wrote records out of order.</summary>
    private const long OverlapMs = 10 * 60 * 1000;

    /// <returns>How many records were new.</returns>
    public static int Run(TraceDatabase database, IWindowsRecordSource source)
    {
        var through = database.Read(connection => ImportedThrough(connection));
        var records = source.ReadSince(through is { } at ? at - OverlapMs : 0);
        if (records.Count == 0)
        {
            return 0;
        }

        return database.Write(connection =>
        {
            // Never re-read what has been read once, even if the user deletes it.
            using (var watermark = connection.CreateCommand())
            {
                watermark.CommandText =
                    """
                    INSERT INTO import_state (source, imported_through) VALUES ($source, $through)
                    ON CONFLICT(source) DO UPDATE SET
                        imported_through = MAX(import_state.imported_through, excluded.imported_through);
                    """;
                watermark.Parameters.AddWithValue("$source", Source);
                watermark.Parameters.AddWithValue("$through", records.Max(r => r.TimestampUtcMs));
                watermark.ExecuteNonQuery();
            }

            var added = 0;
            using var command = connection.CreateCommand();
            command.CommandText =
                """
                INSERT OR IGNORE INTO windows_records (log, record_id, provider, event_id, timestamp, kind)
                VALUES ($log, $record_id, $provider, $event_id, $timestamp, $kind);
                """;
            var log = command.Parameters.Add("$log", SqliteType.Text);
            var recordId = command.Parameters.Add("$record_id", SqliteType.Integer);
            var provider = command.Parameters.Add("$provider", SqliteType.Text);
            var eventId = command.Parameters.Add("$event_id", SqliteType.Integer);
            var timestamp = command.Parameters.Add("$timestamp", SqliteType.Integer);
            var kind = command.Parameters.Add("$kind", SqliteType.Text);

            foreach (var record in records)
            {
                log.Value = record.Log;
                recordId.Value = record.RecordId;
                provider.Value = record.Provider;
                eventId.Value = record.EventId;
                timestamp.Value = record.TimestampUtcMs;
                kind.Value = record.Kind.ToStorage();
                added += command.ExecuteNonQuery();
            }

            return added;
        });
    }

    private static long? ImportedThrough(SqliteConnection connection)
    {
        using var command = connection.CreateCommand();
        command.CommandText = "SELECT imported_through FROM import_state WHERE source = $source;";
        command.Parameters.AddWithValue("$source", Source);
        return command.ExecuteScalar() is long at ? at : null;
    }

    /// <summary>Deletes copied records in [from, to). They are not copied again.</summary>
    public static int DeleteRange(SqliteConnection connection, long fromUtcMs, long toUtcMs)
    {
        using var command = connection.CreateCommand();
        command.CommandText = "DELETE FROM windows_records WHERE timestamp >= $from AND timestamp < $to;";
        command.Parameters.AddWithValue("$from", fromUtcMs);
        command.Parameters.AddWithValue("$to", toUtcMs);
        return command.ExecuteNonQuery();
    }
}
