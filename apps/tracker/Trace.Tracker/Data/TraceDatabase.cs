using System.Reflection;
using Microsoft.Data.Sqlite;
using Trace.Tracker.Diagnostics;

namespace Trace.Tracker.Data;

/// <summary>
/// Thrown when the database is unusable in a way Trace must not paper over.
/// </summary>
internal sealed class TraceDatabaseException(string message, Exception? inner = null)
    : Exception(message, inner);

/// <summary>
/// Owns <c>activity.db</c>: connection, pragmas, migrations, integrity.
///
/// The tracker is the sole writer (implementation plan §3), so there is exactly
/// one write connection, serialised by a lock. Readers get their own
/// connections — in WAL mode SQLite supports many concurrent readers alongside
/// one writer, which is what lets IPC queries run without ever blocking the
/// session engine.
/// </summary>
internal sealed class TraceDatabase : IDisposable
{
    private const int CurrentSchemaVersion = 1;

    private readonly string _path;
    private readonly Lock _writeGate = new();
    private readonly SqliteConnection _write;
    private bool _disposed;

    private TraceDatabase(string path, SqliteConnection write)
    {
        _path = path;
        _write = write;
    }

    /// <summary>
    /// Opens or creates the database and brings it to the current schema.
    ///
    /// <paramref name="afterUncleanExit"/> triggers an integrity check. It is
    /// skipped on a clean start because the check reads every page, which on a
    /// multi-year history is real work to do at every logon for no reason.
    /// </summary>
    public static TraceDatabase Open(string path, bool afterUncleanExit)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);

        var connection = OpenConnection(path, readOnly: false);

        try
        {
            if (afterUncleanExit && !PassesIntegrityCheck(connection))
            {
                connection.Dispose();
                connection = QuarantineAndRecreate(path);
            }

            var database = new TraceDatabase(path, connection);
            database.Migrate();
            return database;
        }
        catch
        {
            connection.Dispose();
            throw;
        }
    }

    /// <summary>
    /// Runs <paramref name="work"/> against the write connection inside a
    /// transaction. Everything the engine persists for one state transition
    /// goes through a single call, so a transition is never half-recorded.
    /// </summary>
    public T Write<T>(Func<SqliteConnection, T> work)
    {
        lock (_writeGate)
        {
            ObjectDisposedException.ThrowIf(_disposed, this);

            using var transaction = _write.BeginTransaction();
            var result = work(_write);
            transaction.Commit();
            return result;
        }
    }

    public void Write(Action<SqliteConnection> work) =>
        Write<object?>(connection =>
        {
            work(connection);
            return null;
        });

    /// <summary>
    /// Runs <paramref name="work"/> on a fresh read-only connection. Safe to
    /// call from any thread; never blocks the writer.
    /// </summary>
    public T Read<T>(Func<SqliteConnection, T> work)
    {
        ObjectDisposedException.ThrowIf(_disposed, this);

        using var connection = OpenConnection(_path, readOnly: true);
        return work(connection);
    }

    /// <summary>
    /// Folds the WAL back into the main database file. Called before sleep and
    /// before shutdown, so an interrupted machine leaves as little unmerged
    /// work as possible.
    /// </summary>
    public void Checkpoint()
    {
        lock (_writeGate)
        {
            if (_disposed)
            {
                return;
            }

            try
            {
                using var command = _write.CreateCommand();
                command.CommandText = "PRAGMA wal_checkpoint(TRUNCATE);";
                command.ExecuteNonQuery();
            }
            catch (SqliteException ex)
            {
                Log.Warn("WAL checkpoint failed.", ex);
            }
        }
    }

    private static SqliteConnection OpenConnection(string path, bool readOnly)
    {
        var connectionString = new SqliteConnectionStringBuilder
        {
            DataSource = path,
            Mode = readOnly ? SqliteOpenMode.ReadOnly : SqliteOpenMode.ReadWriteCreate,
            Pooling = false,
            DefaultTimeout = 5,
        }.ToString();

        var connection = new SqliteConnection(connectionString);
        connection.Open();

        using var pragmas = connection.CreateCommand();
        pragmas.CommandText = readOnly
            ? "PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;"
            // synchronous=FULL rather than the usual NORMAL: write volume here
            // is a few thousand commits a day, and the product's stated
            // philosophy is that recorded truth survives power loss.
            : """
              PRAGMA journal_mode = WAL;
              PRAGMA synchronous = FULL;
              PRAGMA foreign_keys = ON;
              PRAGMA busy_timeout = 5000;
              """;
        pragmas.ExecuteNonQuery();

        return connection;
    }

    private static bool PassesIntegrityCheck(SqliteConnection connection)
    {
        try
        {
            using var command = connection.CreateCommand();
            command.CommandText = "PRAGMA integrity_check;";
            var result = command.ExecuteScalar() as string;

            if (string.Equals(result, "ok", StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }

            Log.Error($"Database integrity check failed: {result}");
            return false;
        }
        catch (SqliteException ex)
        {
            Log.Error("Database integrity check could not run.", ex);
            return false;
        }
    }

    /// <summary>
    /// Moves a corrupt database aside and starts a fresh one.
    ///
    /// The old file is renamed, never deleted: it is the user's history, and
    /// some of it may still be recoverable by hand. Silently discarding it
    /// would be the one unforgivable failure for a product whose promise is
    /// that your computer remembers.
    /// </summary>
    private static SqliteConnection QuarantineAndRecreate(string path)
    {
        var quarantined = TracePaths.QuarantinedDatabaseFile(DateTimeOffset.UtcNow);

        try
        {
            File.Move(path, quarantined);
            foreach (var suffix in new[] { "-wal", "-shm" })
            {
                if (File.Exists(path + suffix))
                {
                    File.Move(path + suffix, quarantined + suffix);
                }
            }
        }
        catch (IOException ex)
        {
            throw new TraceDatabaseException(
                $"The activity database appears corrupt and could not be moved aside to '{quarantined}'.",
                ex);
        }

        Log.Error(
            $"Activity database was corrupt. The damaged file has been kept at '{quarantined}' " +
            "and a new empty database created. No data has been deleted.");

        return OpenConnection(path, readOnly: false);
    }

    /// <summary>
    /// Applies migrations one version at a time, each inside the same
    /// transaction that bumps <c>schema_version</c>, so a failure part-way
    /// leaves the database on the previous version rather than in between.
    /// </summary>
    private void Migrate()
    {
        var current = ReadSchemaVersion();

        if (current > CurrentSchemaVersion)
        {
            // Refuse rather than guess. A newer schema means the user has run a
            // newer Trace against this data; silently downgrading it would
            // destroy history.
            throw new TraceDatabaseException(
                $"The activity database is version {current}, but this version of Trace understands " +
                $"only up to {CurrentSchemaVersion}. Update Trace to open it.");
        }

        if (current == CurrentSchemaVersion)
        {
            return;
        }

        if (current > 0)
        {
            BackUpBeforeMigrating(current);
        }

        for (var next = current + 1; next <= CurrentSchemaVersion; next++)
        {
            var script = ReadMigrationScript(next);
            Log.Info($"Applying database migration {next:000}.");

            lock (_writeGate)
            {
                using var transaction = _write.BeginTransaction();
                using var command = _write.CreateCommand();

                command.CommandText = script;
                command.ExecuteNonQuery();

                // 001 seeds the row; later migrations update it.
                if (next > 1)
                {
                    command.CommandText = "UPDATE schema_version SET version = $version;";
                    command.Parameters.AddWithValue("$version", next);
                    command.ExecuteNonQuery();
                }

                transaction.Commit();
            }
        }
    }

    private int ReadSchemaVersion()
    {
        using var command = _write.CreateCommand();

        command.CommandText =
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_version';";
        if (command.ExecuteScalar() is null)
        {
            return 0; // brand new database
        }

        command.CommandText = "SELECT MAX(version) FROM schema_version;";
        return command.ExecuteScalar() is long version ? (int)version : 0;
    }

    /// <summary>
    /// A timestamped copy before any schema change beyond the initial one. A
    /// migration bug must never be the reason someone loses years of history.
    /// </summary>
    private void BackUpBeforeMigrating(int fromVersion)
    {
        var backup = Path.Combine(
            Path.GetDirectoryName(_path)!,
            $"activity.pre-v{fromVersion}-{DateTimeOffset.UtcNow:yyyyMMdd-HHmmss}.db");

        try
        {
            using var destination = new SqliteConnection(
                new SqliteConnectionStringBuilder { DataSource = backup, Pooling = false }.ToString());
            destination.Open();
            _write.BackupDatabase(destination);

            Log.Info($"Backed up the database to '{backup}' before migrating.");
        }
        catch (SqliteException ex)
        {
            throw new TraceDatabaseException(
                "Could not back up the activity database before migrating; refusing to migrate.", ex);
        }
    }

    private static string ReadMigrationScript(int version)
    {
        var assembly = Assembly.GetExecutingAssembly();
        var name = assembly.GetManifestResourceNames()
            .SingleOrDefault(n => n.EndsWith($".{version:000}_", StringComparison.Ordinal)
                                  || n.Contains($".{version:000}_", StringComparison.Ordinal));

        if (name is null)
        {
            throw new TraceDatabaseException($"Migration {version:000} is missing from the build.");
        }

        using var stream = assembly.GetManifestResourceStream(name)!;
        using var reader = new StreamReader(stream);
        return reader.ReadToEnd();
    }

    public void Dispose()
    {
        lock (_writeGate)
        {
            if (_disposed)
            {
                return;
            }

            _disposed = true;
            _write.Dispose();
        }
    }
}
