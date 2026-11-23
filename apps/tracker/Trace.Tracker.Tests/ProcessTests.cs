using Trace.Contracts;
using Trace.Tracker.Identity;
using Trace.Tracker.Processes;

namespace Trace.Tracker.Tests;

/// <summary>
/// Background apps: snapshots in, process lifetimes out, with every limit of
/// polling kept in the record rather than hidden.
/// </summary>
public class ProcessTests
{
    private const long Second = 1_000;

    private sealed class ScriptedSource : IProcessSource
    {
        public List<ObservedProcess> Now { get; set; } = [];

        public IReadOnlyList<ObservedProcess> Snapshot() => Now;
    }

    private sealed class Namer : IProcessNamer
    {
        private readonly ApplicationIdentityResolver _resolver = new(ApplicationRegistry.Default, new NoSources());

        public ResolvedIdentity Resolve(string executable, string? path) => _resolver.Resolve(executable, path);

        public int Version => _resolver.Version;
    }

    private sealed class NoSources : IIdentitySources
    {
        public VersionNames? ReadVersionNames(string executablePath) => null;

        public string? ReadPackageDisplayName(string packageFamilyName) => null;
    }

    private static ObservedProcess WhatsApp(uint pid, long created, uint parent = 1) =>
        new(pid, parent, "whatsapp.exe", @"C:\Apps\whatsapp.exe", created);

    private static (ProcessRecorder Recorder, ScriptedSource Source) Recorder(PersistenceHarness trace, params string[] excluded)
    {
        var source = new ScriptedSource();
        return (new ProcessRecorder(trace.Database, source, new Namer(), executable => excluded.Contains(executable)), source);
    }

    private static List<(long Pid, long Started, string State, long? Ended)> Rows(PersistenceHarness trace) =>
        trace.Query(
            "SELECT pid, started_at, end_state, ended_at FROM process_instances ORDER BY id;",
            r => (r.GetInt64(0), r.GetInt64(1), r.GetString(2), r.IsDBNull(3) ? (long?)null : r.GetInt64(3)));

    [Fact]
    public void A_process_is_recorded_from_its_Windows_start_until_a_poll_no_longer_finds_it()
    {
        using var trace = new PersistenceHarness();
        var (recorder, source) = Recorder(trace);

        source.Now = [WhatsApp(42, created: 500)];
        recorder.Poll(10 * Second);
        recorder.Poll(12 * Second);
        source.Now = [];
        recorder.Poll(14 * Second);

        Assert.Equal([(42L, 500L, "ended", (long?)(14 * Second))], Rows(trace));
    }

    [Fact]
    public void A_reused_process_id_is_a_new_process_not_a_continuation()
    {
        using var trace = new PersistenceHarness();
        var (recorder, source) = Recorder(trace);

        source.Now = [WhatsApp(42, created: 500)];
        recorder.Poll(10 * Second);
        // Between two polls, 42 ended and Windows gave the id to a new process.
        source.Now = [WhatsApp(42, created: 11 * Second)];
        recorder.Poll(12 * Second);

        Assert.Equal(
            [(42L, 500L, "ended", (long?)(12 * Second)), (42L, 11 * Second, "running", (long?)null)],
            Rows(trace));
    }

    [Fact]
    public void A_process_whose_start_cannot_be_read_starts_when_first_seen_and_says_so()
    {
        using var trace = new PersistenceHarness();
        var (recorder, source) = Recorder(trace);

        source.Now = [new ObservedProcess(7, 1, "secure.exe", null, null)];
        recorder.Poll(20 * Second);

        Assert.Equal(
            [(20 * Second, 0L)],
            trace.Query("SELECT started_at, start_observed FROM process_instances;", r => (r.GetInt64(0), r.GetInt64(1))));
    }

    [Fact]
    public void Stopping_marks_what_is_still_running_as_unknown_rather_than_ended()
    {
        using var trace = new PersistenceHarness();
        var (recorder, source) = Recorder(trace);

        source.Now = [WhatsApp(42, created: 500)];
        recorder.Poll(10 * Second);
        recorder.Stop(11 * Second);

        Assert.Equal([(42L, 500L, "unknown", (long?)null)], Rows(trace));
    }

    [Fact]
    public void After_a_restart_a_process_still_running_carries_on_and_one_that_vanished_is_unknown()
    {
        using var trace = new PersistenceHarness();
        var (first, source) = Recorder(trace);
        source.Now = [WhatsApp(42, created: 500), WhatsApp(43, created: 600)];
        first.Poll(10 * Second);

        // Trace stopped without a goodbye; 43 ended while nobody was looking.
        var (second, after) = Recorder(trace);
        after.Now = [WhatsApp(42, created: 500)];
        second.Poll(60 * Second);

        Assert.Equal(
            [(42L, 500L, "running", (long?)null), (43L, 600L, "unknown", (long?)null)],
            Rows(trace));
    }

    [Fact]
    public void An_excluded_application_never_reaches_the_record()
    {
        using var trace = new PersistenceHarness();
        var (recorder, source) = Recorder(trace, "1password.exe");

        source.Now = [new ObservedProcess(9, 1, "1password.exe", @"C:\Apps\1password.exe", 100)];
        recorder.Poll(10 * Second);

        Assert.Equal(0, trace.CountRows("process_instances"));
        Assert.Equal(0, trace.CountRows("applications"));
    }

    [Fact]
    public void The_report_groups_processes_into_apps_and_names_parents_without_trusting_reused_ids()
    {
        using var trace = new PersistenceHarness();
        var (recorder, source) = Recorder(trace);

        // WhatsApp.Root started its helper; both ran together for a while.
        var root = new ObservedProcess(10, 1, "whatsapp.root.exe", @"C:\Apps\whatsapp.root.exe", 1 * Second);
        var helper = new ObservedProcess(11, 10, "whatsapp.exe", @"C:\Apps\whatsapp.exe", 2 * Second);
        source.Now = [root, helper];
        recorder.Poll(5 * Second);
        source.Now = [root];
        recorder.Poll(7 * Second);

        var report = new BackgroundQueries(trace.Database).Get(new BackgroundQuery(0, 100 * Second), enabled: true, 9 * Second);

        var app = Assert.Single(report.Apps);
        Assert.Equal(("WhatsApp", 2, 1), (app.Name, app.InstanceCount, app.RunningNow));
        Assert.Equal(8, app.RunningSeconds); // 1s → 9s, overlap counted once
        Assert.Equal("whatsapp.root.exe", app.Instances.Single(i => i.Pid == 11).ParentExecutable);
    }

    [Fact]
    public void Overlapping_lifetimes_are_counted_once()
    {
        Assert.Equal(10, BackgroundQueries.UnionSeconds([(0, 6_000), (4_000, 10_000), (10_000, 10_000)]));
    }

    [Fact]
    public void Deleting_everything_deletes_the_process_record_too()
    {
        using var trace = new PersistenceHarness();
        var (recorder, source) = Recorder(trace);
        source.Now = [WhatsApp(42, created: 500)];
        recorder.Poll(10 * Second);

        new Data.DataOperations(trace.Database).DeleteEverything();

        Assert.Equal(0, trace.CountRows("process_instances"));
    }
}
