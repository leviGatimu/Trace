using Microsoft.Data.Sqlite;
using Trace.Tracker.Data;
using Trace.Tracker.Data.Repositories;
using Trace.Tracker.Engine;
using Trace.Tracker.Identity;

namespace Trace.Tracker.Processes;

/// <summary>A process seen in one snapshot.</summary>
/// <param name="CreatedUtcMs">Windows' creation time, or null when the process could not be opened.</param>
internal sealed record ObservedProcess(uint Pid, uint ParentPid, string Executable, string? Path, long? CreatedUtcMs);

/// <summary>Where snapshots come from. A seam, so the recorder can be tested without Windows.</summary>
internal interface IProcessSource
{
    /// <summary>The processes running now in this user's Windows session.</summary>
    IReadOnlyList<ObservedProcess> Snapshot();
}

/// <summary>Names an executable for the applications table, as the foreground tracker does.</summary>
internal interface IProcessNamer
{
    ResolvedIdentity Resolve(string executable, string? path);

    int Version { get; }
}

/// <summary>
/// Turns a series of snapshots into process lifetimes.
///
/// Each poll is compared with the last: a process not seen before has
/// started, one no longer seen has ended. A start read from Windows is exact;
/// an end is known only to within one poll, and a process that lived for less
/// than one poll may never be seen at all. Both limits are kept in the record
/// rather than hidden.
/// </summary>
internal sealed class ProcessRecorder(TraceDatabase database, IProcessSource source, IProcessNamer namer, Func<string, bool> isExcluded)
{
    private readonly record struct Key(uint Pid, long StartedAt);

    private readonly object _gate = new();
    private Dictionary<uint, (Key Key, string Executable)> _running = [];
    private bool _primed;
    private readonly Dictionary<string, long> _applicationIds = new(StringComparer.Ordinal);
    private int _polls;

    /// <summary>Takes one snapshot and records what changed. Safe to call from a timer.</summary>
    public void Poll(long nowUtcMs)
    {
        if (!Monitor.TryEnter(_gate))
        {
            return; // the previous poll is still writing; skip rather than queue
        }

        try
        {
            var snapshot = source.Snapshot().Where(process => !isExcluded(process.Executable)).ToList();
            database.Write(connection =>
            {
                if (!_primed)
                {
                    Prime(connection, snapshot);
                }

                Apply(connection, snapshot, nowUtcMs);
                if (++_polls % 30 == 0)
                {
                    TouchRunning(connection, nowUtcMs);
                }
            });
        }
        finally
        {
            Monitor.Exit(_gate);
        }
    }

    /// <summary>
    /// Recording is stopping (switched off, paused or shutting down). Whatever
    /// is still running will not be seen to end, so it is marked unknown rather
    /// than left looking as if it were running for ever.
    /// </summary>
    public void Stop(long nowUtcMs)
    {
        lock (_gate)
        {
            database.Write(connection =>
            {
                TouchRunning(connection, nowUtcMs);
                using var command = connection.CreateCommand();
                command.CommandText = "UPDATE process_instances SET end_state = 'unknown' WHERE end_state = 'running';";
                command.ExecuteNonQuery();
            });
            _running = [];
            _primed = false;
        }
    }

    /// <summary>
    /// Picks up rows left 'running' by the previous run. Those whose process is
    /// still here carry on; the rest ended while Trace was not looking.
    /// </summary>
    private void Prime(SqliteConnection connection, List<ObservedProcess> snapshot)
    {
        var present = snapshot
            .Where(process => process.CreatedUtcMs is not null)
            .Select(process => new Key(process.Pid, process.CreatedUtcMs!.Value))
            .ToHashSet();

        var leftover = new List<(long Id, Key Key, string Executable)>();
        using (var command = connection.CreateCommand())
        {
            command.CommandText = "SELECT id, pid, started_at, executable FROM process_instances WHERE end_state = 'running';";
            using var reader = command.ExecuteReader();
            while (reader.Read())
            {
                leftover.Add((reader.GetInt64(0), new Key((uint)reader.GetInt64(1), reader.GetInt64(2)), reader.GetString(3)));
            }
        }

        foreach (var (id, key, executable) in leftover)
        {
            if (present.Contains(key))
            {
                _running[key.Pid] = (key, executable);
            }
            else
            {
                using var command = connection.CreateCommand();
                command.CommandText = "UPDATE process_instances SET end_state = 'unknown' WHERE id = $id;";
                command.Parameters.AddWithValue("$id", id);
                command.ExecuteNonQuery();
            }
        }

        _primed = true;
    }

    private void Apply(SqliteConnection connection, List<ObservedProcess> snapshot, long nowUtcMs)
    {
        var seen = new HashSet<uint>();
        foreach (var process in snapshot)
        {
            seen.Add(process.Pid);
            if (_running.TryGetValue(process.Pid, out var known)
                && known.Executable == process.Executable
                && (process.CreatedUtcMs is null || process.CreatedUtcMs == known.Key.StartedAt))
            {
                continue; // the same process as last time
            }

            if (_running.TryGetValue(process.Pid, out var replaced))
            {
                // The id now belongs to a different process: the old one ended.
                End(connection, replaced.Key, nowUtcMs);
            }

            var startedAt = process.CreatedUtcMs ?? nowUtcMs;
            var key = new Key(process.Pid, startedAt);
            Insert(connection, process, startedAt, nowUtcMs);
            _running[process.Pid] = (key, process.Executable);
        }

        foreach (var pid in _running.Keys.Where(pid => !seen.Contains(pid)).ToList())
        {
            End(connection, _running[pid].Key, nowUtcMs);
            _running.Remove(pid);
        }
    }

    private void Insert(SqliteConnection connection, ObservedProcess process, long startedAt, long nowUtcMs)
    {
        var applicationId = ApplicationFor(connection, process, nowUtcMs);
        using var command = connection.CreateCommand();
        command.CommandText =
            """
            INSERT INTO process_instances
                (pid, parent_pid, executable, path, application_id, started_at, start_observed, last_seen_at, end_state)
            VALUES ($pid, $parent, $executable, $path, $application, $started, $observed, $now, 'running')
            ON CONFLICT(pid, started_at) DO UPDATE SET end_state = 'running', ended_at = NULL, last_seen_at = $now;
            """;
        command.Parameters.AddWithValue("$pid", (long)process.Pid);
        command.Parameters.AddWithValue("$parent", process.ParentPid == 0 ? DBNull.Value : (long)process.ParentPid);
        command.Parameters.AddWithValue("$executable", process.Executable);
        command.Parameters.AddWithValue("$path", (object?)process.Path ?? DBNull.Value);
        command.Parameters.AddWithValue("$application", (object?)applicationId ?? DBNull.Value);
        command.Parameters.AddWithValue("$started", startedAt);
        command.Parameters.AddWithValue("$observed", process.CreatedUtcMs is null ? 0 : 1);
        command.Parameters.AddWithValue("$now", nowUtcMs);
        command.ExecuteNonQuery();
    }

    private static void End(SqliteConnection connection, Key key, long nowUtcMs)
    {
        using var command = connection.CreateCommand();
        command.CommandText =
            """
            UPDATE process_instances SET end_state = 'ended', ended_at = $now, last_seen_at = $now
             WHERE pid = $pid AND started_at = $started AND end_state = 'running';
            """;
        command.Parameters.AddWithValue("$pid", (long)key.Pid);
        command.Parameters.AddWithValue("$started", key.StartedAt);
        command.Parameters.AddWithValue("$now", nowUtcMs);
        command.ExecuteNonQuery();
    }

    private static void TouchRunning(SqliteConnection connection, long nowUtcMs)
    {
        using var command = connection.CreateCommand();
        command.CommandText = "UPDATE process_instances SET last_seen_at = $now WHERE end_state = 'running';";
        command.Parameters.AddWithValue("$now", nowUtcMs);
        command.ExecuteNonQuery();
    }

    /// <summary>
    /// The applications row for this executable, created if it has never been
    /// in front, so a background-only process still gets a name, a profile and
    /// an icon. Cached: the names do not change while Trace runs.
    /// </summary>
    private long? ApplicationFor(SqliteConnection connection, ObservedProcess process, long nowUtcMs)
    {
        if (_applicationIds.TryGetValue(process.Executable, out var cached))
        {
            return cached;
        }

        var identity = namer.Resolve(process.Executable, process.Path);
        var id = ApplicationRepository.Upsert(
            connection,
            new TrackedApplication(
                process.Pid,
                process.Executable,
                identity.Name,
                process.Path,
                identity.Category,
                identity.PackageFamily,
                identity.Source,
                namer.Version,
                identity.ProfileKey,
                identity.ProfileLink),
            nowUtcMs);
        _applicationIds[process.Executable] = id;
        return id;
    }
}
