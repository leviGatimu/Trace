using Trace.Contracts;
using Trace.Tracker.Coverage;
using Trace.Tracker.Data.Queries;
using Trace.Tracker.Engine;

namespace Trace.Tracker.Tests;

/// <summary>
/// Coverage: every moment of a range is either recorded, or a gap that says
/// what is known about it. "Nothing happened" and "nothing was recorded" must
/// never look alike.
/// </summary>
public class CoverageTests
{
    private const long Minute = 60_000;
    private const long Hour = 60 * Minute;

    private static TraceSpan Recorded(long from, long to, bool endEstimated = false) =>
        new("recorded", from, to, endEstimated, "S-1");

    private static StoredWindowsRecord Windows(long id, long at, WindowsRecordKind kind) => new(id, at, kind);

    private static List<CoverageSegment> Build(
        IReadOnlyList<TraceSpan> spans, IReadOnlyList<StoredWindowsRecord> records, long? recordsFrom = 0, long to = 10 * Hour) =>
        CoverageBuilder.Build(0, to, long.MaxValue / 2, spans, records, recordsFrom);

    [Fact]
    public void A_gap_Windows_explains_as_sleep_is_labelled_asleep_and_cites_the_record()
    {
        var segments = Build(
            [Recorded(0, 2 * Hour), Recorded(5 * Hour, 10 * Hour)],
            [Windows(7, 2 * Hour + Minute, WindowsRecordKind.Sleep), Windows(8, 5 * Hour - Minute, WindowsRecordKind.Wake)]);

        Assert.Equal(
            [
                ("recorded", 0L, 2 * Hour, "observed"),
                ("unrecorded-window", 2 * Hour, 2 * Hour + Minute, "inferred"),
                ("asleep", 2 * Hour + Minute, 5 * Hour - Minute, "observed"),
                ("unrecorded-window", 5 * Hour - Minute, 5 * Hour, "inferred"),
                ("recorded", 5 * Hour, 10 * Hour, "observed"),
            ],
            segments.Select(s => (s.Kind, s.StartedAt, s.EndedAt ?? -1, s.Evidence)));
        Assert.Equal(["WR-7"], segments[2].EvidenceIds);
        Assert.Equal("windows", segments[2].Source);
    }

    [Fact]
    public void A_gap_Trace_restarted_in_is_Trace_not_running_and_cites_the_start()
    {
        var segments = CoverageBuilder.Build(0, 10 * Hour, long.MaxValue / 2,
            [Recorded(0, Hour), Recorded(3 * Hour, 10 * Hour)], [], 0, 0,
            [new TrackerStart(3 * Hour - Minute, 77)]);

        Assert.Equal(
            [("recorded", "observed"), ("trace-stopped", "inferred"), ("unrecorded-window", "inferred"), ("recorded", "observed")],
            segments.Select(s => (s.Kind, s.Evidence)));
        Assert.Equal(["E-77"], segments[1].EvidenceIds);
        Assert.Equal(3 * Hour - Minute, segments[1].EndedAt);
    }

    [Fact]
    public void A_gap_with_no_restart_is_Trace_running_without_a_recordable_window()
    {
        var segments = Build([Recorded(0, Hour), Recorded(Hour + 5 * Minute, 10 * Hour)], []);

        Assert.Equal("unrecorded-window", segments[1].Kind);
        Assert.Contains("Trace was running", segments[1].Explanation, StringComparison.Ordinal);
    }

    [Fact]
    public void A_shutdown_and_boot_split_the_gap_into_off_signed_out_and_on()
    {
        var segments = Build(
            [Recorded(0, Hour), Recorded(6 * Hour, 10 * Hour)],
            [
                Windows(1, Hour + Minute, WindowsRecordKind.Shutdown),
                Windows(2, 4 * Hour, WindowsRecordKind.Boot),
                Windows(3, 4 * Hour + 2 * Minute, WindowsRecordKind.SignIn),
            ]);

        Assert.Equal(
            ["recorded", "unrecorded-window", "powered-off", "signed-out", "unrecorded-window", "recorded"],
            segments.Select(s => s.Kind));
    }

    [Fact]
    public void Without_Windows_records_for_the_time_a_gap_is_unknown_not_quiet()
    {
        // Trace stopped, and the Windows log does not go back that far.
        var segments = Build([Recorded(3 * Hour, 10 * Hour)], [], recordsFrom: 5 * Hour);

        var gap = segments[0];
        Assert.Equal(("unknown", "unknown", 0L, 3 * Hour), (gap.Kind, gap.Evidence, gap.StartedAt, gap.EndedAt ?? -1));
    }

    [Fact]
    public void Before_Trace_started_recording_is_its_own_kind_of_unknown()
    {
        var segments = CoverageBuilder.Build(0, 10 * Hour, long.MaxValue / 2,
            [Recorded(4 * Hour, 10 * Hour)], [], 0, traceHistoryFrom: 4 * Hour);

        Assert.Equal(("before-trace", "unknown", 0L, 4 * Hour),
            (segments[0].Kind, segments[0].Evidence, segments[0].StartedAt, segments[0].EndedAt ?? -1));
        Assert.Equal(["before-trace", "recorded"], segments.Select(s => s.Kind));
    }

    [Fact]
    public void A_gap_after_a_crash_says_its_start_is_estimated()
    {
        var segments = Build(
            [Recorded(0, Hour, endEstimated: true), Recorded(2 * Hour, 10 * Hour)], []);

        Assert.True(segments[0].Explanation.Contains("estimated", StringComparison.Ordinal));
        Assert.True(segments[1].StartEstimated);
        Assert.Equal("unrecorded-window", segments[1].Kind);
    }

    [Fact]
    public void A_missing_end_stays_open_rather_than_being_guessed_shut()
    {
        var segments = CoverageBuilder.Build(0, 10 * Hour, nowUtcMs: 4 * Hour,
            [new TraceSpan("recorded", Hour, null, false, "S-9")], [], 0);

        var open = segments.Single(s => s.Kind == "recorded");
        Assert.Null(open.EndedAt);
        // Nothing is claimed about the future.
        Assert.DoesNotContain(segments, s => s.StartedAt >= 4 * Hour);
    }

    [Fact]
    public void Back_to_back_sessions_are_one_recorded_stretch_and_instants_between_them_are_not_gaps()
    {
        var segments = Build(
            [Recorded(0, Hour), Recorded(Hour + 2_000, 2 * Hour), Recorded(2 * Hour + 30_000, 10 * Hour)], []);

        Assert.Equal(["recorded", "recorded"], segments.Select(s => s.Kind));
        Assert.Equal(Hour * 2, segments[0].EndedAt);
    }

    [Fact]
    public void Overlapping_trace_spans_are_never_counted_twice()
    {
        var segments = Build(
            [Recorded(0, 2 * Hour), new TraceSpan("locked", 2 * Hour - 500, 3 * Hour, false, "E-4"), Recorded(3 * Hour, 10 * Hour)], []);

        Assert.Equal(["recorded", "locked", "recorded"], segments.Select(s => s.Kind));
        Assert.Equal(2 * Hour, segments[1].StartedAt);
        var total = segments.Sum(s => (s.EndedAt ?? 0) - s.StartedAt);
        Assert.Equal(10 * Hour, total);
    }

    // -- import ---------------------------------------------------------------

    [Fact]
    public void Importing_twice_copies_each_Windows_record_once()
    {
        using var trace = new PersistenceHarness();
        var source = new FakeSource(
            new WindowsRecord("System", 1, "Microsoft-Windows-Kernel-Power", 42, 1_000, WindowsRecordKind.Sleep),
            new WindowsRecord("System", 2, "Microsoft-Windows-Kernel-Power", 107, 5_000, WindowsRecordKind.Wake));

        Assert.Equal(2, WindowsRecordImport.Run(trace.Database, source));
        Assert.Equal(0, WindowsRecordImport.Run(trace.Database, source));
        Assert.Equal(2, trace.CountRows("windows_records"));
    }

    [Fact]
    public void Deleted_Windows_records_are_not_copied_back_in()
    {
        using var trace = new PersistenceHarness();
        var source = new FakeSource(
            new WindowsRecord("System", 1, "Microsoft-Windows-Kernel-Power", 42, 1_000, WindowsRecordKind.Sleep),
            new WindowsRecord("System", 2, "Microsoft-Windows-Kernel-Power", 107, 50 * Hour, WindowsRecordKind.Wake));
        WindowsRecordImport.Run(trace.Database, source);

        new Data.DataOperations(trace.Database).DeleteEverything();
        WindowsRecordImport.Run(trace.Database, source);

        // Only the overlap window before the watermark is re-read; the old record stays deleted.
        Assert.Equal([50 * Hour], trace.Query("SELECT timestamp FROM windows_records;", r => r.GetInt64(0)));
    }

    [Fact]
    public void The_report_reads_recorded_sessions_locks_and_Windows_records_together()
    {
        using var trace = new PersistenceHarness();
        var opened = trace.Gate.OpenSession(new TrackedApplication(1, "notepad.exe", "Notepad", null), 0)!.Value;
        trace.Gate.CloseSession(opened.SessionId, Hour, 3600, 0, EndReason.APP_SWITCH);
        WindowsRecordImport.Run(trace.Database, new FakeSource(
            new WindowsRecord("System", 1, "Microsoft-Windows-Kernel-Power", 42, Hour + Minute, WindowsRecordKind.Sleep)));

        var report = new CoverageQueries(trace.Database).Get(new CoverageQuery(0, 3 * Hour), 3 * Hour);

        Assert.Equal(["recorded", "unrecorded-window", "asleep"], report.Segments.Select(s => s.Kind));
        Assert.Equal([$"S-{opened.SessionId}"], report.Segments[0].EvidenceIds);
        Assert.Equal(0, report.TraceHistoryFrom);
        Assert.Equal(Hour + Minute, report.WindowsRecordsFrom);
    }

    // -- evidence ids -----------------------------------------------------------

    [Theory]
    [InlineData("S-12", "S", 12L)]
    [InlineData(" w-3 ", "W", 3L)]
    [InlineData("WR-40", "WR", 40L)]
    public void An_evidence_id_is_recognised(string text, string prefix, long id)
    {
        Assert.Equal((prefix, id), EvidenceIds.TryParse(text));
    }

    [Theory]
    [InlineData("S-")]
    [InlineData("WhatsApp")]
    [InlineData("X-1")]
    public void Anything_else_is_not_an_evidence_id(string text)
    {
        Assert.Null(EvidenceIds.TryParse(text));
    }

    [Fact]
    public void Searching_an_evidence_id_opens_its_session()
    {
        using var trace = new PersistenceHarness();
        var opened = trace.Gate.OpenSession(new TrackedApplication(1, "notepad.exe", "Notepad", null), 1_000)!.Value;
        trace.Gate.CloseSession(opened.SessionId, 9_000, 8, 0, EndReason.APP_SWITCH);

        var result = Assert.Single(new SearchQueries(trace.Database)
            .Search(new SearchQueryParams($"S-{opened.SessionId}", null, null, null), 10_000));

        Assert.Equal((opened.SessionId, "evidence"), (result.SessionId, result.MatchedOn));
    }

    private sealed class FakeSource(params WindowsRecord[] records) : IWindowsRecordSource
    {
        public IReadOnlyList<WindowsRecord> ReadSince(long fromUtcMs) =>
            records.Where(r => r.TimestampUtcMs >= fromUtcMs).ToList();
    }
}
