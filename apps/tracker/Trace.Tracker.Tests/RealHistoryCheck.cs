using Microsoft.Data.Sqlite;
using Trace.Contracts;
using Trace.Tracker.Data;
using Trace.Tracker.Data.Queries;
using Trace.Tracker.Identity;
using Trace.Tracker.Windows;
using Xunit.Abstractions;

namespace Trace.Tracker.Tests;

/// <summary>
/// Upgrades a COPY of a real history and reports what changed. Does nothing
/// unless TRACE_HISTORY_COPY names that copy, so the normal suite never touches
/// a real database:
///
///   copy %LOCALAPPDATA%\Trace\Data\activity.db somewhere\activity.db
///   set TRACE_HISTORY_COPY=somewhere\activity.db
///   dotnet test --filter RealHistoryCheck
/// </summary>
public class RealHistoryCheck(ITestOutputHelper output)
{
    private static readonly string[] Evidence = ["sessions", "window_sessions", "events"];

    [Fact]
    public void A_copy_of_real_history_upgrades_and_groups_without_losing_records()
    {
        var path = Environment.GetEnvironmentVariable("TRACE_HISTORY_COPY");
        if (string.IsNullOrEmpty(path))
        {
            return;
        }

        var before = Count(path);

        using var database = TraceDatabase.Open(path, afterUncleanExit: false);
        var renamed = IdentityBackfill.Run(database, ProcessIdentity.Resolver);
        output.WriteLine($"Re-resolved {renamed} executables.");

        var after = database.Read(connection => Evidence.ToDictionary(t => t, t => Scalar(connection, $"SELECT COUNT(*) FROM {t};")));
        foreach (var table in Evidence)
        {
            output.WriteLine($"{table}: {before[table]} before, {after[table]} after");
            Assert.Equal(before[table], after[table]);
        }

        database.Read(connection =>
        {
            output.WriteLine($"executables {Scalar(connection, "SELECT COUNT(*) FROM applications;")}, " +
                             $"profiles {Scalar(connection, "SELECT COUNT(*) FROM profiles;")}, " +
                             $"unlinked {Scalar(connection, "SELECT COUNT(*) FROM applications WHERE profile_id IS NULL;")}");
            using var command = connection.CreateCommand();
            command.CommandText =
                """
                SELECT p.name, GROUP_CONCAT(a.executable || ' [' || a.profile_link || ']', ', ')
                  FROM profiles p JOIN applications a ON a.profile_id = p.id
                 GROUP BY p.id HAVING COUNT(*) > 1 ORDER BY p.name;
                """;
            using var reader = command.ExecuteReader();
            while (reader.Read())
            {
                output.WriteLine($"  {reader.GetString(0)}: {reader.GetString(1)}");
            }

            Assert.Equal(0L, Scalar(connection, "SELECT COUNT(*) FROM applications WHERE profile_id IS NULL;"));
            return 0;
        });

        var hits = new SearchQueries(database).Search(new SearchQueryParams("WhatsApp.Root", null, null, 500), long.MaxValue);
        output.WriteLine($"search 'WhatsApp.Root': {hits.Count} hits, applications: " +
                         string.Join(", ", hits.Select(h => h.ApplicationName).Distinct()));
        Assert.Single(hits.Select(h => h.ApplicationId).Distinct());

        // Coverage, with this machine's real System log.
        var copied = Coverage.WindowsRecordImport.Run(database, SystemLogSource.Instance);
        var again = Coverage.WindowsRecordImport.Run(database, SystemLogSource.Instance);
        output.WriteLine($"Windows records copied: {copied}, on a second pass: {again}");

        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var report = new Coverage.CoverageQueries(database).Get(
            new CoverageQuery(now - 380L * 86_400_000, now), now);
        output.WriteLine($"Trace history from {Local(report.TraceHistoryFrom)}, Windows records from {Local(report.WindowsRecordsFrom)}");
        foreach (var kind in report.Segments.GroupBy(s => s.Kind))
        {
            var hours = kind.Sum(s => ((s.EndedAt ?? now) - s.StartedAt) / 3_600_000.0);
            output.WriteLine($"  {kind.Key,-13} {kind.Count(),6} segments {hours,9:F1} h");
        }

        foreach (var gap in report.Segments.Where(s => s.Kind is not "recorded" && s.StartedAt > now - 3L * 86_400_000))
        {
            output.WriteLine($"  {Local(gap.StartedAt)} → {Local(gap.EndedAt)}  {gap.Kind} [{gap.Evidence}] {string.Join(",", gap.EvidenceIds)}");
        }

        Assert.Equal(0, again);
    }

    /// <summary>Reads this machine's real process list. Opt-in like the rest of this file.</summary>
    [Fact]
    public void The_real_process_list_is_this_session_only_and_has_start_times()
    {
        if (Environment.GetEnvironmentVariable("TRACE_REAL_PROCESSES") is null)
        {
            return;
        }

        var processes = new WindowsProcessSource().Snapshot();
        output.WriteLine($"{processes.Count} processes in this session; {processes.Count(p => p.CreatedUtcMs is not null)} with a start time; {processes.Count(p => p.Path is not null)} with a path");
        foreach (var process in processes.GroupBy(p => p.Executable).OrderByDescending(g => g.Count()).Take(15))
        {
            output.WriteLine($"  {process.Key} x{process.Count()}");
        }

        Assert.NotEmpty(processes);
        Assert.DoesNotContain(processes, p => p.Executable is "system" or "registry" or "smss.exe" or "services.exe");
    }

    /// <summary>Reads the live System page figures on this machine. Opt-in.</summary>
    [Fact]
    public void The_live_system_figures_read_on_this_machine()
    {
        if (Environment.GetEnvironmentVariable("TRACE_REAL_PROCESSES") is null)
        {
            return;
        }

        var monitor = new SystemMonitor(() => new Dictionary<string, (long, string)>());
        monitor.Read(DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
        Thread.Sleep(1000);
        var live = monitor.Read(DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());

        output.WriteLine($"CPU {live.Cpu.Name} x{live.Cpu.LogicalCores}: {live.Cpu.UsagePercent:F1}%");
        output.WriteLine($"Memory {live.Memory.UsedBytes / 1e9:F1} of {live.Memory.TotalBytes / 1e9:F1} GB");
        output.WriteLine($"GPU {string.Join(", ", live.Gpu?.Names ?? [])}: {live.Gpu?.UsagePercent:F1}%, {live.Gpu?.DedicatedUsedBytes / 1e9:F2} of {live.Gpu?.DedicatedTotalBytes / 1e9:F2} GB");
        foreach (var device in live.Devices)
        {
            output.WriteLine($"  [{device.Kind}/{device.Connection}] {device.Name}");
        }

        foreach (var process in live.Processes.Take(8))
        {
            output.WriteLine($"  {process.Executable} x{process.Count}: {process.CpuPercent}% {process.MemoryBytes / 1e6:F0} MB");
        }

        Assert.True(live.Memory.TotalBytes > 0);
        Assert.NotEmpty(live.Processes);
    }

    private static string Local(long? utcMs) =>
        utcMs is { } ms ? DateTimeOffset.FromUnixTimeMilliseconds(ms).ToLocalTime().ToString("yyyy-MM-dd HH:mm") : "—";

    private static Dictionary<string, long> Count(string path)
    {
        using var connection = new SqliteConnection($"Data Source={path};Mode=ReadOnly;Pooling=False");
        connection.Open();
        return Evidence.ToDictionary(t => t, t => Scalar(connection, $"SELECT COUNT(*) FROM {t};"));
    }

    private static long Scalar(SqliteConnection connection, string sql)
    {
        using var command = connection.CreateCommand();
        command.CommandText = sql;
        return (long)command.ExecuteScalar()!;
    }
}
