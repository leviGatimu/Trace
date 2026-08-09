using Microsoft.Data.Sqlite;
using Trace.Contracts;
using Trace.Tracker.Data;
using Trace.Tracker.Privacy;
using Trace.Tracker.Settings;

namespace Trace.Tracker.Tests;

/// <summary>
/// A throwaway Trace installation on disk: its own settings file and its own
/// real SQLite database, deleted when the test finishes.
///
/// These tests deliberately use a real database rather than a fake. The whole
/// point of Milestone 4 is that what the engine decides actually lands in
/// storage — with real cascades, real constraints and real recovery — and a
/// fake would prove none of that.
/// </summary>
internal sealed class PersistenceHarness : IDisposable
{
    private readonly string _directory;

    public PersistenceHarness(Action<Contracts.Settings>? _ = null)
    {
        _directory = Path.Combine(Path.GetTempPath(), "trace-tests", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(_directory);

        SettingsPath = Path.Combine(_directory, "settings.json");
        DatabasePath = Path.Combine(_directory, "activity.db");

        Settings = new SettingsStore(SettingsPath);
        Database = TraceDatabase.Open(DatabasePath, afterUncleanExit: false);
        Gate = new PrivacyGate(Database, Settings);
    }

    public string SettingsPath { get; }

    public string DatabasePath { get; }

    public SettingsStore Settings { get; }

    public TraceDatabase Database { get; private set; }

    public PrivacyGate Gate { get; private set; }

    /// <summary>An engine wired through the gate into the real database.</summary>
    public EngineHarness NewEngine() => new(Gate);

    /// <summary>
    /// Closes and reopens the database as if the process had restarted,
    /// optionally as though it had crashed. This is how recovery is tested
    /// without actually killing a process.
    /// </summary>
    public void Restart(bool asIfCrashed)
    {
        Database.Dispose();
        Database = TraceDatabase.Open(DatabasePath, afterUncleanExit: asIfCrashed);
        Gate = new PrivacyGate(Database, Settings);
    }

    public long CountRows(string table) =>
        Database.Read(connection =>
        {
            using var command = connection.CreateCommand();
            command.CommandText = $"SELECT COUNT(*) FROM {table};";
            return (long)command.ExecuteScalar()!;
        });

    public List<T> Query<T>(string sql, Func<SqliteDataReader, T> read) =>
        Database.Read(connection =>
        {
            using var command = connection.CreateCommand();
            command.CommandText = sql;

            var rows = new List<T>();
            using var reader = command.ExecuteReader();

            while (reader.Read())
            {
                rows.Add(read(reader));
            }

            return rows;
        });

    /// <summary>Every row of every table, for "nothing was recorded" assertions.</summary>
    public long TotalRowsAcrossAllTables() =>
        CountRows("applications")
        + CountRows("sessions")
        + CountRows("window_sessions")
        + CountRows("events")
        + CountRows("tracker_state");

    public List<string> AllRecordedText()
    {
        var text = Query(
            "SELECT name FROM applications UNION ALL SELECT executable FROM applications",
            r => r.GetString(0));

        text.AddRange(Query(
            "SELECT title FROM window_sessions WHERE title IS NOT NULL", r => r.GetString(0)));

        text.AddRange(Query(
            "SELECT current_window FROM tracker_state WHERE current_window IS NOT NULL",
            r => r.GetString(0)));

        text.AddRange(Query(
            "SELECT metadata FROM events WHERE metadata IS NOT NULL", r => r.GetString(0)));

        return text;
    }

    public void Dispose()
    {
        Database.Dispose();
        SqliteConnection.ClearAllPools();

        try
        {
            Directory.Delete(_directory, recursive: true);
        }
        catch (IOException)
        {
            // A leftover temp directory is not worth failing a test over.
        }
    }
}
